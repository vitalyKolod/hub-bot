import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'
import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { packCb } from '../core/callback.js'
import { getOrCreateUser } from '../services/user.service.js'
import { getActiveProPresenterFlowNumber, getTeamById } from '../services/team.service.js'
import {
  addToWaitlist,
  claimBatchReadyNotification,
  PROPRESENTER_BATCH_SIZE,
} from '../services/proPresenterWaitlist.service.js'
import { getStreamByNumber } from '../services/proPresenterStream.service.js'
import {
  ADMIN_GROUP_ID,
  PROP_WAITLIST_THREAD_ID,
  PROP_STREAM_VERIFY_THREAD_ID,
} from '../config/env.js'
import type { MyContext } from '../types/context.js'
import { auditLogService, buildSubscriptionTargetId } from '../services/auditLog.service.js'

// ===== Навигация (просто переходы между экранами) =====

async function stopIfTeamAlreadyHasStream(ctx: MyContext, teamId: string) {
  const flowNumber = await getActiveProPresenterFlowNumber(teamId)
  if (!flowNumber) return false

  await ctx.answerCallbackQuery({
    text: `У вашей команды уже есть поток №${flowNumber}`,
    show_alert: true,
  })
  return true
}

export async function handlePropNoStream(ctx: MyContext, userId: number, teamId: string) {
  if (await stopIfTeamAlreadyHasStream(ctx, teamId)) return
  const team = await getTeamById(teamId)
  if (!team || team.ownerId !== userId) {
    await ctx.answerCallbackQuery({ text: 'Подать заявку может только владелец команды', show_alert: true })
    return
  }
  ctx.session.propWaitlistDraft = { teamId, step: 'count' }
  goTo(userId, 'propresenter_no_stream', teamId)
  await renderScreen(ctx, userId, 'propresenter_no_stream', ctx.session.propWaitlistDraft)
}

export async function handlePropWaitlistDeviceCountText(ctx: MyContext): Promise<boolean> {
  const draft = ctx.session.propWaitlistDraft
  if (!draft || draft.step !== 'count' || ctx.chat?.type !== 'private' || !ctx.message?.text) return false
  if (ctx.message.text.startsWith('/')) {
    ctx.session.propWaitlistDraft = undefined
    return false
  }
  const raw = ctx.message.text.trim()
  await ctx.deleteMessage().catch(() => {})
  const count = /^\d{1,2}$/.test(raw) ? Number(raw) : 0
  if (count < 1 || count > PROPRESENTER_BATCH_SIZE) {
    await ctx.reply(`Отправьте число от 1 до ${PROPRESENTER_BATCH_SIZE} цифрами.`)
    return true
  }
  draft.deviceCount = count
  draft.step = 'confirm'
  await renderScreen(ctx, ctx.from!.id, 'propresenter_no_stream', draft)
  return true
}

export async function handlePropWaitlistCountChoice(ctx: MyContext, teamId: string, confirmed: boolean) {
  const draft = ctx.session.propWaitlistDraft
  if (!draft || draft.teamId !== teamId || (confirmed && draft.step !== 'confirm')) {
    await ctx.answerCallbackQuery({ text: 'Начните заявку заново', show_alert: true })
    return
  }
  draft.step = confirmed ? 'final' : 'count'
  if (!confirmed) draft.deviceCount = undefined
  await renderScreen(ctx, ctx.from!.id, 'propresenter_no_stream', draft)
  await ctx.answerCallbackQuery()
}

export async function handlePropHasStream(ctx: MyContext, userId: number, teamId: string) {
  if (await stopIfTeamAlreadyHasStream(ctx, teamId)) return
  goTo(userId, 'propresenter_streams', teamId)
  await renderScreen(ctx, userId, 'propresenter_streams', teamId)
}

export async function handlePropSelectStream(ctx: MyContext, userId: number, params: string) {
  goTo(userId, 'propresenter_confirm', params)
  await renderScreen(ctx, userId, 'propresenter_confirm', params)
}

// ===== Отправка заявок админу =====

export async function handlePropConfirmStream(ctx: MyContext, userId: number, params: string) {
  const [flowNumber, teamId] = params.split(':')

  if (await stopIfTeamAlreadyHasStream(ctx, teamId)) return

  const team = await getTeamById(teamId)
  const owner = await getOrCreateUser(userId)

  if (!team) {
    await ctx.answerCallbackQuery({ text: 'Команда не найдена' })
    return
  }

  const adminNotice = new FormattedString('')
    .plain('📡 ').bold('ЗАЯВКА НА ПРОВЕРКУ ПОТОКА')
    .plain('\n━━━━━━━━━━━━━━\n\nКоманда заявляет, что состоит в ')
    .bold(`Потоке №${flowNumber}`)
    .plain('.\n\n👤 ').bold('Владелец:').plain(` ${owner.fio || 'не указано'}`)
    .plain('\n😎 ').bold('Юзернейм:').plain(` ${owner.username ? '@' + owner.username.replace(/^@/, '') : 'не указано'}`)
    .plain('\n🆔 ').bold('ID:').plain(' ').code(String(userId))
    .plain('\n👥 ').bold('Команда:').plain(` ${team.name}`)
    .plain('\n🆔 ').bold('Team ID:').plain(' ').code(teamId)
    .plain('\n\n').code(`FLOW_NUMBER:${flowNumber}`)
    .plain('\n\n━━━━━━━━━━━━━━\nПроверь, действительно ли эта команда состоит в потоке!')

  const kb = new InlineKeyboard()
    .text('✅ Подтвердить', packCb({ a: 'prop_verify_accept', p: `${teamId}:${flowNumber}` }))
    .text('❌ Отклонить', packCb({ a: 'prop_verify_reject', p: teamId }))
    .row().url('👤 Открыть Telegram-профиль', `tg://user?id=${userId}`)

  await ctx.api.sendMessage(ADMIN_GROUP_ID, adminNotice.text, {
    entities: adminNotice.entities,
    message_thread_id: PROP_STREAM_VERIFY_THREAD_ID,
    reply_markup: kb,
  })

  await ctx.editMessageCaption({
    caption:
      '✅ *Заявка отправлена администратору!*\n\n' +
      'Как только он подтвердит, что вы состоите в этом потоке — подписка появится в профиле команды.',
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🏠 Главное меню', packCb({ a: 'home' })),
  })

  await ctx.answerCallbackQuery({ text: 'Заявка отправлена ✓' })
}

export async function handlePropNoStreamConfirm(ctx: MyContext, userId: number, teamId: string) {
  if (await stopIfTeamAlreadyHasStream(ctx, teamId)) return
  const draft = ctx.session.propWaitlistDraft
  if (!draft || draft.teamId !== teamId || draft.step !== 'final' || !draft.deviceCount) {
    await ctx.answerCallbackQuery({ text: 'Сначала укажите количество устройств', show_alert: true })
    return
  }
  const { entry, position, created } = await addToWaitlist(teamId, userId, draft.deviceCount)
  ctx.session.propWaitlistDraft = undefined

  const team = await getTeamById(teamId)
  const owner = await getOrCreateUser(userId)
  const flowNumber = entry.assignedFlowNumber!
  const deviceCount = entry.deviceCount || 1

  const kb = new InlineKeyboard()
    .text('👥 Открыть команду', `ap:wt:${teamId}:${flowNumber}`).row()
    .url('👤 Открыть Telegram-профиль', `tg://user?id=${userId}`)

  if (created) {
    const notice = new FormattedString('')
      .emoji('🎬', '5251272469175631339').plain(' ')
      .bold(`Новая заявка на поток ProPresenter №${flowNumber}`)
      .plain(`\n\n👤 ${owner.fio || 'не указано'}\n`)
      .plain(`😎 ${owner.username ? '@' + owner.username.replace(/^@/, '') : 'Без username'}\n`)
      .plain(`🆔 Telegram ID: ${userId}\n`)
      .plain(`👥 Команда: ${team?.name || 'неизвестно'}\n`)
      .plain(`🆔 Team ID: ${teamId}\n`)
      .plain(`🖥 Устройств: ${deviceCount}\n\n`)
      .bold(`Заполнено: ${position}/${PROPRESENTER_BATCH_SIZE}`)
    await ctx.api.sendMessage(ADMIN_GROUP_ID, notice.text, {
      entities: notice.entities,
      message_thread_id: PROP_WAITLIST_THREAD_ID,
      reply_markup: kb,
    })
    const communityGroupId = Number(process.env.HUB_COMMUNITY_GROUP_ID || 0)
    if (communityGroupId) {
      const communityNotice = new FormattedString('')
        .emoji('🎬', '5251272469175631339')
        .bold(` ProPresenter · будущий поток №${flowNumber}`)
        .plain('\nЗанято мест для устройств: ')
        .bold(`${position}/${PROPRESENTER_BATCH_SIZE}`)
      await ctx.api.sendMessage(communityGroupId, communityNotice.text, {
        entities: communityNotice.entities,
        message_thread_id: Number(process.env.HUB_COMMUNITY_PROPRESENTER_THREAD_ID || 2),
      }).catch((error) => console.error('Не удалось отправить статистику в Hub Community:', error))
    }
  }

  if (await claimBatchReadyNotification(flowNumber)) {
    await ctx.api.sendMessage(
      ADMIN_GROUP_ID,
      `✅ *Поток ProPresenter №${flowNumber} собран!*\n\n` +
        `Занято ${PROPRESENTER_BATCH_SIZE}/${PROPRESENTER_BATCH_SIZE} мест для устройств. Можно создавать поток.`,
      {
        parse_mode: 'Markdown',
        message_thread_id: PROP_WAITLIST_THREAD_ID,
        reply_markup: new InlineKeyboard().text(
          `✅ Поток №${flowNumber} создал`,
          `ap:wait:${flowNumber}:create`
        ),
      }
    )
  }

  await ctx.editMessageCaption({
    caption:
      `${created ? '✅ *Заявка отправлена!*' : 'ℹ️ *Вы уже находитесь в очереди.*'}\n\n` +
      `Будущий поток: *№${flowNumber}*\n` +
      `Устройств: *${deviceCount}*\n` +
      `Занято мест: *${position} из ${PROPRESENTER_BATCH_SIZE}*\n\n` +
      'Как только поток будет создан, мы сообщим и выдадим доступ.',
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🏠 Главное меню', packCb({ a: 'home' })),
  })

  await ctx.answerCallbackQuery({
    text: created ? 'Заявка отправлена ✓' : `Вы уже №${position} в очереди`,
  })
}

// ===== Подтверждение/отклонение админом (пишет в БД) =====

export async function handlePropVerifyAccept(
  ctx: MyContext,
  params: string,
  caption: string,
  messageId: number
) {
  const [teamId, flowNumberStr] = params.split(':')
  const flowNumber = Number(flowNumberStr)

  if (!teamId) {
    await ctx.answerCallbackQuery({ text: 'Team ID не найден' })
    return
  }

  if (!flowNumber) {
    await ctx.answerCallbackQuery({ text: 'Номер потока не найден' })
    return
  }

  const team = await getTeamById(teamId)

  if (!team) {
    await ctx.answerCallbackQuery({ text: 'Команда не найдена' })
    return
  }

  const stream = await getStreamByNumber(flowNumber)

  if (!stream) {
    await ctx.answerCallbackQuery({ text: 'Поток не найден в базе' })
    return
  }

  const existing = team.subscriptions.get('propresenter')

  team.subscriptions.set('propresenter', {
    status: 'active',
    expiresAt: stream.expiresAt || existing?.expiresAt || null,
    meta: {
      flowNumber: stream.flowNumber,
      email: stream.email,
      password: stream.password,
      chatLink: stream.chatLink,
    },
  } as any)

  await team.save()

  const auditBase = {
    actorType: 'admin' as const,
    actorTelegramId: ctx.from?.id,
    targetUserId: team.ownerId,
    targetTeamId: teamId,
    targetSubscriptionId: buildSubscriptionTargetId(teamId, 'propresenter'),
    metadata: {
      teamName: team.name,
      productId: 'propresenter',
      productName: 'Pro Presenter',
      flowNumber,
      expiresAt: stream.expiresAt,
    },
  }
  if (!existing || ['none', 'rejected'].includes(existing.status)) {
    await auditLogService.createLog({ type: 'subscription.created', ...auditBase })
  }
  await auditLogService.createLog({ type: 'subscription.activated', ...auditBase })
  await auditLogService.createLog({ type: 'propresenter.team_added', ...auditBase })

  await ctx.api.sendMessage(
    team.ownerId,
    `✅ Поток №${flowNumber} подтверждён!\n\n` +
      `📧 Логин: ${stream.email}\n` +
      `🔑 Пароль: ${stream.password}\n` +
      (stream.chatLink ? `💬 Чат потока: ${stream.chatLink}\n` : '') +
      `\nДоступ появился в профиле команды.\n
      нажмите /team_list, чтобы открыть профиль команды.`
  )

  const safeText = `${caption}\n\n✅ Подтверждено!`
  await ctx.api.editMessageText(String(ADMIN_GROUP_ID), messageId, safeText)

  await ctx.answerCallbackQuery({ text: 'Подтверждено ✓' })
}

export async function handlePropVerifyReject(
  ctx: MyContext,
  teamId: string,
  caption: string,
  messageId: number
) {
  const team = await getTeamById(teamId)

  if (team) {
    await ctx.api.sendMessage(
      team.ownerId,
      '❌ Не удалось подтвердить принадлежность к указанному потоку. Свяжитесь с поддержкой.'
    )
  }

  const safeText = `${caption}\n\n❌ Отклонено`
  await ctx.api.editMessageText(String(ADMIN_GROUP_ID), messageId, safeText)

  await ctx.answerCallbackQuery({ text: 'Отклонено ✗' })
}
