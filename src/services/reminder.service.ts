import { Bot, InlineKeyboard } from 'grammy'
import { getProduct } from '../config/products.js'
import { packCb } from '../core/callback.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { TeamModel } from '../models/Team.js'
import { GroupAccessRevocationModel } from '../models/GroupAccessRevocation.js'
import { auditLogService, buildSubscriptionTargetId, recordOperationalEvent } from './auditLog.service.js'

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDER_DAYS = new Set([14, 10, 7, 5, 4, 3, 2, 1])

function expiryToken(expiresAt: Date) {
  return expiresAt.toISOString().slice(0, 10).replaceAll('-', '')
}

function daysLeft(expiresAt: Date) {
  return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS))
}

export function describeGroupRemovalError(error: unknown): { diagnosis: string; action: string } {
  const raw = String((error as any)?.description || (error as any)?.message || error)
  if (/PARTICIPANT_ID_INVALID/i.test(raw)) return {
    diagnosis: 'Telegram не распознал участника для этого чата. Это не подтверждает, что он сейчас состоит в чате.',
    action: 'Сверить Telegram ID пользователя и ID чата; проверить членство через Telegram и права бота.',
  }
  if (/CHAT_ADMIN_REQUIRED|not enough rights|administrator rights/i.test(raw)) return {
    diagnosis: 'У бота недостаточно прав для удаления участников.',
    action: 'Назначить бота администратором этого чата с правом блокировать участников.',
  }
  if (/USER_ADMIN_INVALID|can't remove chat owner|creator/i.test(raw)) return {
    diagnosis: 'Целевой пользователь — администратор или владелец чата; бот не может его удалить.',
    action: 'Проверить роль пользователя в чате и снять административные права вручную, если это допустимо.',
  }
  if (/chat not found|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(raw)) return {
    diagnosis: 'Telegram не нашёл чат по указанному ID или бот не имеет к нему доступа.',
    action: 'Проверить ID чата и присутствие бота в нём.',
  }
  if (/429|Too Many Requests|retry after/i.test(raw)) return {
    diagnosis: 'Telegram временно ограничил частоту запросов.',
    action: 'Бот повторит удаление позже.',
  }
  return {
    diagnosis: 'Telegram отклонил удаление; однозначная причина из ответа не следует.',
    action: 'Проверить ответ Telegram, ID чата, членство пользователя и права бота.',
  }
}

function renewalKeyboard(productId: string, teamId: string) {
  const screen = productId === 'propresenter' ? 'propresenter' : productId
  return new InlineKeyboard().text(
    '🔄 Продлить подписку',
    packCb({ a: 'open', s: screen, p: teamId })
  )
}

async function notifyAdmin(
  bot: Bot<any>,
  team: any,
  productId: string,
  flowNumber: number,
  expiresAt: Date,
  remaining: number
) {
  const adminGroupId = Number(process.env.ADMIN_GROUP_ID)
  if (!adminGroupId) return false

  const productName = getProduct(productId)?.name || productId
  const callbackData =
    productId === 'propresenter'
      ? `pr:a:preview:${flowNumber}`
      : `renew:t:${team._id}:${productId}:${expiryToken(expiresAt)}`
  const scope =
    productId === 'propresenter'
      ? `Поток ProPresenter №${flowNumber}`
      : `Команда «${team.name}», продукт «${productName}»`

  try {
    await bot.api.sendMessage(
      adminGroupId,
      `🔔 ${scope}\nДо окончания осталось ${remaining} дн.\nДата: ${expiresAt.toLocaleDateString('ru-RU')}`,
      {
        reply_markup: new InlineKeyboard().text(productId === 'propresenter' ? '📡 Проверить поток' : '✅ Продлил на 1 год', callbackData),
      }
    )
    return true
  } catch (error) {
    console.error('Admin renewal reminder failed:', error)
    return false
  }
}

async function notifyMembers(bot: Bot<any>, team: any, text: string, productId: string) {
  const recipients = new Set<number>(
    team.members
      .filter((member: any) => member.status === 'active')
      .map((member: any) => member.telegramId)
  )

  for (const telegramId of recipients) {
    const options =
      productId === 'propresenter'
        ? undefined
        : { reply_markup: renewalKeyboard(productId, String(team._id)) }
    const details = {
      actorType: 'system' as const,
      targetUserId: telegramId,
      targetTeamId: String(team._id),
      targetSubscriptionId: buildSubscriptionTargetId(String(team._id), productId),
    }
    try {
      await bot.api.sendMessage(telegramId, text, options)
      await recordOperationalEvent({
        type: 'subscription.reminder_sent', ...details,
        metadata: { productId, expiresAt: team.subscriptions.get(productId)?.expiresAt,
          result: 'Telegram API принял сообщение; прочтение неизвестно' },
      })
    } catch (error) {
      console.error(`Reminder delivery failed for ${telegramId}:`, error)
      await recordOperationalEvent({
        type: 'subscription.reminder_failed', ...details,
        metadata: { productId, expiresAt: team.subscriptions.get(productId)?.expiresAt,
          result: 'не отправлено', reason: error instanceof Error ? error.message : String(error) },
      })
    }
  }
}

async function reconcileGroupAccess(bot: Bot<any>, teams: any[], streams: Map<number, any>) {
  const now = new Date()
  const expired = new Map<string, { chatId: number; telegramId: number; productId: string; teamId: string }>()
  const entitled = new Set<string>()

  for (const team of teams) for (const [productId, sub] of team.subscriptions.entries()) {
    // Продление ProPresenter — общий сбор потока. Голос или взнос отдельной
    // команды не управляют членством в чате и не запускают удаление участников.
    if (productId === 'propresenter') continue
    if (!sub.expiresAt || !['active', 'expired'].includes(sub.status)) continue
    const flow = Number(sub.meta?.flowNumber)
    const chatId = productId === 'propresenter'
      ? Number(streams.get(flow)?.chatId || process.env[`PROPRESENTER_FLOW_${flow}_CHAT_ID`]) || 0 : Number(getProduct(productId)?.groupId) || 0
    const expiry = productId === 'propresenter' ? streams.get(flow)?.expiresAt || sub.expiresAt : sub.expiresAt
    // Дата в будущем сохраняет доступ даже при ошибочном legacy-статусе
    // `expired`. Ручное отключение проходит через отдельную очередь задач.
    const active = new Date(expiry) > now
    for (const member of team.members) {
      if (member.status !== 'active') continue
      if (!chatId) {
        const missingKey = `access:missing-chat:${productId}:${flow || '-'}:${new Date(expiry).toISOString()}`
        if (!active && !team.reminders.includes(missingKey)) {
          team.reminders.push(missingKey)
          await team.save()
          await recordOperationalEvent({ type: 'access.group_removal_failed',
          actorType: 'system', targetUserId: member.telegramId, targetTeamId: String(team._id),
          metadata: { productId, flowNumber: flow || undefined, result: 'чат не настроен',
            reason: 'Отсутствует ID чата; удаление невозможно' } })
        }
        continue
      }
      const key = `${chatId}:${member.telegramId}`
      if (active) entitled.add(key)
      else expired.set(key, { chatId, telegramId: member.telegramId, productId, teamId: String(team._id) })
    }
  }

  // Задачи, созданные ручным отключением, продолжают выполняться после смены статуса.
  const queued = await GroupAccessRevocationModel.find({ status: { $in: ['pending', 'protected', 'restored'] } })
  for (const task of queued) {
    if (task.productId === 'propresenter') continue
    const key = `${task.chatId}:${task.telegramId}`
    if (!expired.has(key)) expired.set(key, {
      chatId: task.chatId, telegramId: task.telegramId, productId: task.productId, teamId: task.teamId,
    })
  }

  for (const candidate of expired.values()) {
    const key = `${candidate.chatId}:${candidate.telegramId}`
    const task = await GroupAccessRevocationModel.findOneAndUpdate(
      { chatId: candidate.chatId, telegramId: candidate.telegramId },
      { $setOnInsert: { ...candidate, status: 'pending' } },
      { upsert: true, new: true }
    )
    // Перед запросом к Telegram перечитываем права: администратор мог продлить
    // подписку после начала этого прохода, а старая задача могла остаться в БД.
    const currentTeams = await TeamModel.find({ 'members.telegramId': candidate.telegramId })
    const memberships = currentTeams.filter((team) => team.members.some(
      (member: any) => member.telegramId === candidate.telegramId && member.status === 'active'
    ))
    const currentStreams = await ProPresenterStreamModel.find({ expiresAt: { $ne: null } })
    const currentStreamByNumber = new Map(currentStreams.map((stream) => [stream.flowNumber, stream]))
    const accessFor = (team: any, productId: string) => {
      const sub = team.subscriptions.get(productId)
      if (!sub) return null
      const flow = Number(sub.meta?.flowNumber)
      const chatId = productId === 'propresenter'
        ? Number(currentStreamByNumber.get(flow)?.chatId || process.env[`PROPRESENTER_FLOW_${flow}_CHAT_ID`]) || 0
        : Number(getProduct(productId)?.groupId) || 0
      const expiresAt = productId === 'propresenter'
        ? currentStreamByNumber.get(flow)?.expiresAt || sub.expiresAt : sub.expiresAt
      return { sub, chatId, expiresAt }
    }
    const liveEntitled = memberships.some((team) => [...team.subscriptions.keys()].some((productId) => {
      const access = accessFor(team, productId)
      return access?.chatId === candidate.chatId &&
        ['active', 'expired'].includes(access.sub.status) &&
        access.expiresAt && new Date(access.expiresAt) > new Date()
    }))
    if (entitled.has(key) || liveEntitled) {
      if (task.status !== 'protected' && task.status !== 'blocked') {
        task.status = 'protected'
        await task.save()
        await recordOperationalEvent({ type: 'access.group_retained', actorType: 'system',
          targetUserId: candidate.telegramId, targetTeamId: candidate.teamId,
          metadata: { groupId: candidate.chatId, productId: candidate.productId,
            result: 'доступ сохранён', reason: 'дата действующей подписки ещё не наступила или доступ есть в другой команде' } })
      }
      continue
    }
    const source = memberships.find((team) => String(team._id) === candidate.teamId)
    const access = source && accessFor(source, candidate.productId)
    const expiredByDate = access?.expiresAt && new Date(access.expiresAt) <= new Date() &&
      ['active', 'expired'].includes(access.sub.status)
    const disabled = access && ['none', 'rejected'].includes(access.sub.status)
    if (!access || access.chatId !== candidate.chatId || (!expiredByDate && !disabled)) {
      if (task.status !== 'protected') {
        task.status = 'protected'
        await task.save()
      }
      continue
    }
    if (task.status === 'protected' || task.status === 'restored') {
      task.status = 'pending'
      task.attempts = 0
      task.nextAttemptAt = now
      await task.save()
    }
    if (task.status === 'blocked' || task.nextAttemptAt > now) continue
    try {
      await bot.api.banChatMember(candidate.chatId, candidate.telegramId)
      task.status = 'blocked'
      task.attempts += 1
      task.lastError = ''
      task.completedAt = new Date()
      await task.save()
      await recordOperationalEvent({ type: 'access.group_removed', actorType: 'system',
        targetUserId: candidate.telegramId, targetTeamId: candidate.teamId,
        metadata: { groupId: candidate.chatId, productId: candidate.productId,
          expiresAt: access.expiresAt || undefined,
          accessReason: expiredByDate ? 'срок подписки истёк' : `подписка отключена (статус: ${access.sub.status})`,
          result: 'удалён и заблокирован', attempts: task.attempts } })
    } catch (error) {
      task.attempts += 1
      task.lastError = String((error as any)?.description || (error as any)?.message || error)
      task.nextAttemptAt = new Date(Date.now() + Math.min(60, 2 ** Math.min(task.attempts, 6)) * 60_000)
      await task.save()
      console.error(`Group access removal failed for ${candidate.telegramId}:`, error)
      const explanation = describeGroupRemovalError(error)
      let memberStatus: string | undefined
      if (/PARTICIPANT_ID_INVALID/i.test(task.lastError) && bot.api.getChatMember) {
        try {
          memberStatus = (await bot.api.getChatMember(candidate.chatId, candidate.telegramId)).status
          if (memberStatus === 'left') {
            explanation.diagnosis = 'Telegram сообщает, что пользователь сейчас не состоит в чате.'
            explanation.action = 'Удалять сейчас некого; проверить старые приглашения и вход в чат.'
          } else if (memberStatus === 'kicked') {
            explanation.diagnosis = 'Telegram сообщает, что пользователь уже заблокирован в чате.'
            explanation.action = 'Проверить блокировку в настройках чата.'
          }
        } catch {
          // Диагностический запрос не должен скрывать исходную ошибку удаления.
        }
      }
      await recordOperationalEvent({ type: 'access.group_removal_failed', actorType: 'system',
        targetUserId: candidate.telegramId, targetTeamId: candidate.teamId,
        metadata: { groupId: candidate.chatId, productId: candidate.productId,
          result: 'доступ ещё не отозван', expiresAt: access.expiresAt || undefined,
          accessReason: expiredByDate ? 'срок подписки истёк' : `подписка отключена (статус: ${access.sub.status})`,
          attempts: task.attempts, nextAttemptAt: task.nextAttemptAt,
          telegramError: task.lastError, memberStatus, ...explanation } })
    }
  }

  // Продление снимает бан даже если ранее истёкшая команда была удалена.
  const blocked = await GroupAccessRevocationModel.find({ status: 'blocked' })
  for (const task of blocked) {
    if (!entitled.has(`${task.chatId}:${task.telegramId}`)) continue
    try {
      await bot.api.unbanChatMember(task.chatId, task.telegramId, { only_if_banned: true })
      task.status = 'restored'
      task.completedAt = new Date()
      await task.save()
      await recordOperationalEvent({ type: 'access.group_restored', actorType: 'system',
        targetUserId: task.telegramId, targetTeamId: task.teamId,
        metadata: { groupId: task.chatId, productId: task.productId, result: 'бан снят после продления' } })
    } catch (error) {
      await recordOperationalEvent({ type: 'access.group_removal_failed', actorType: 'system',
        targetUserId: task.telegramId, targetTeamId: task.teamId,
        metadata: { groupId: task.chatId, productId: task.productId,
          result: 'не удалось восстановить доступ', reason: String(error) } })
    }
  }
}

export async function runReminders(bot: Bot<any>) {
  const now = new Date()
  const streams = await ProPresenterStreamModel.find({ expiresAt: { $ne: null } })
  const streamsByNumber = new Map(streams.map((stream) => [stream.flowNumber, stream]))
  const streamExpires = new Map(streams.map((stream) => [stream.flowNumber, stream.expiresAt!]))
  const teams = await TeamModel.find({})

  for (const team of teams) {
    for (const [productId, subscription] of team.subscriptions.entries()) {
      if (subscription.status !== 'active') continue

      const flowNumber = Number((subscription.meta as any)?.flowNumber)
      const expiryValue =
        productId === 'propresenter' && streamExpires.get(flowNumber)
          ? streamExpires.get(flowNumber)!
          : subscription.expiresAt
      if (!expiryValue) continue
      const expiresAt = new Date(expiryValue)

      // Поток является источником правды для всех команд в нём.
      if (
        productId === 'propresenter' &&
        (!subscription.expiresAt ||
          new Date(subscription.expiresAt).getTime() !== expiresAt.getTime())
      ) {
        subscription.expiresAt = expiresAt
        team.subscriptions.set(productId, subscription)
      }

      if (expiresAt <= now) {
        subscription.status = 'expired'
        subscription.expiresAt = expiresAt
        team.subscriptions.set(productId, subscription)
        await team.save()
        await auditLogService.createLog({
          type: 'subscription.expired',
          actorType: 'system',
          targetUserId: team.ownerId,
          targetTeamId: team._id.toString(),
          targetSubscriptionId: buildSubscriptionTargetId(team._id.toString(), productId),
          metadata: {
            teamName: team.name,
            productId,
            productName: getProduct(productId)?.name || productId,
            expiresAt,
          },
        })
        await notifyMembers(
          bot,
          team,
          `❌ Подписка «${getProduct(productId)?.name || productId}» команды «${team.name}» закончилась.\n\nДанные и ссылки на чаты больше недоступны. Чтобы вернуть доступ, продлите подписку.`,
          productId
        )
        if (productId === 'propresenter') {
          const expiredAdminKey = `admin:${productId}:${flowNumber || '-'}:${expiresAt.toISOString()}:expired`
          const stream = streamsByNumber.get(flowNumber)
          if (stream && !(stream.adminReminders || []).includes(expiredAdminKey)) {
            if (await notifyAdmin(bot, team, productId, flowNumber, expiresAt, 0)) {
              stream.adminReminders.push(expiredAdminKey)
              await stream.save()
            }
          }
        }
        continue
      }

      const remaining = daysLeft(expiresAt)
      if (!REMINDER_DAYS.has(remaining)) continue

      const cycle = expiresAt.toISOString()
      const reminderKey = `${productId}:${flowNumber || '-'}:${cycle}:${remaining}d`
      if ((team.reminders || []).includes(reminderKey)) continue

      const productName = getProduct(productId)?.name || productId
      const text =
        productId === 'propresenter'
          ? `🎬 Вы находитесь в потоке ProPresenter №${flowNumber}. До окончания подписки осталось ${remaining} дн.\n\nОбсудите продление в чате своего потока, чтобы не потерять доступ.`
          : `⏳ До окончания подписки «${productName}» команды «${team.name}» осталось ${remaining} дн.\n\nДля продления нажмите кнопку ниже.`

      await notifyMembers(bot, team, text, productId)
      team.reminders.push(reminderKey)

      if (productId === 'propresenter') {
        const adminKey = `admin:${reminderKey}`
        const stream = streamsByNumber.get(flowNumber)
        if (stream && !(stream.adminReminders || []).includes(adminKey)) {
          if (await notifyAdmin(bot, team, productId, flowNumber, expiresAt, remaining)) {
            stream.adminReminders.push(adminKey)
            await stream.save()
          }
        }
      }
      await team.save()
    }
  }
  await reconcileGroupAccess(bot, teams, streamsByNumber)
}

/** End dates only prompt an administrator; they never disconnect members. */
export async function runYandex360Reminders(bot: Bot<any>) {
  const { Yandex360StreamModel } = await import('../models/Yandex360.js')
  const group = Number(process.env.ADMIN_GROUP_ID)
  if (!group) return
  const streams = await Yandex360StreamModel.find({ endsAt: { $ne: null } })
  for (const stream of streams) {
    const end = stream.endsAt
    if (!end) continue
    const remaining = Math.ceil((end.getTime() - Date.now()) / DAY_MS)
    if (remaining > 14 || (remaining > 0 && !REMINDER_DAYS.has(remaining))) continue
    const key = `${end.toISOString()}:${remaining <= 0 ? 'ended' : remaining}`
    if (stream.adminReminders.includes(key)) continue
    try {
      await bot.api.sendMessage(group, `🔔 Яндекс 360: поток «${stream.name}» ${remaining <= 0 ? 'достиг даты окончания' : `заканчивается через ${remaining} дн.`}. Проверьте фактический статус участников.`, { message_thread_id: Number(process.env.YANDEX360_THREAD_ID) || undefined })
      stream.adminReminders.push(key)
      await stream.save()
    } catch (error) { console.error('Yandex 360 reminder failed:', error) }
  }
}
