import { Bot, InlineKeyboard } from 'grammy'
import { getProduct } from '../config/products.js'
import { packCb } from '../core/callback.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { TeamModel } from '../models/Team.js'

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDER_DAYS = new Set([14, 10, 7, 5, 4, 3, 2, 1])

function expiryToken(expiresAt: Date) {
  return expiresAt.toISOString().slice(0, 10).replaceAll('-', '')
}

function daysLeft(expiresAt: Date) {
  return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS))
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
      ? `renew:f:${flowNumber}:${expiryToken(expiresAt)}`
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
        reply_markup: new InlineKeyboard().text('✅ Продлил на 1 год', callbackData),
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
    await bot.api
      .sendMessage(telegramId, text, options)
      .catch((error) => console.error(`Reminder delivery failed for ${telegramId}:`, error))
  }
}

async function removeExpiredGroupAccess(bot: Bot<any>, team: any, productId: string) {
  const groupId = getProduct(productId)?.groupId
  if (!groupId) return

  for (const member of team.members) {
    if (member.status !== 'active') continue

    // Не удаляем человека, если тот же продукт ещё активен у другой его команды.
    const hasOtherAccess = await TeamModel.exists({
      _id: { $ne: team._id },
      'members.telegramId': member.telegramId,
      [`subscriptions.${productId}.status`]: 'active',
      [`subscriptions.${productId}.expiresAt`]: { $gt: new Date() },
    })
    if (hasOtherAccess) continue

    await bot.api
      .banChatMember(groupId, member.telegramId)
      .then(() => bot.api.unbanChatMember(groupId, member.telegramId))
      .catch((error) =>
        console.error(`Group access removal failed for ${member.telegramId}:`, error)
      )
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
        await removeExpiredGroupAccess(bot, team, productId)
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
}
