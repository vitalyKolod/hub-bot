import { InlineKeyboard } from 'grammy'
import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { packCb } from '../core/callback.js'
import { escapeUnderscore } from '../utils/escape.js'
import { getOrCreateUser } from '../services/user.service.js'
import { getTeamById } from '../services/team.service.js'
import { addToWaitlist, getPendingWaitlist } from '../services/proPresenterWaitlist.service.js'
import { getStreamByNumber } from '../services/proPresenterStream.service.js'
import {
  ADMIN_GROUP_ID,
  PROP_WAITLIST_THREAD_ID,
  PROP_STREAM_VERIFY_THREAD_ID,
} from '../config/env.js'
import type { MyContext } from '../types/context.js'

// ===== Навигация (просто переходы между экранами) =====

export async function handlePropNoStream(ctx: MyContext, userId: number, teamId: string) {
  goTo(userId, 'propresenter_no_stream', teamId)
  await renderScreen(ctx, userId, 'propresenter_no_stream', teamId)
}

export async function handlePropHasStream(ctx: MyContext, userId: number, teamId: string) {
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

  const team = await getTeamById(teamId)
  const owner = await getOrCreateUser(userId)

  if (!team) {
    await ctx.answerCallbackQuery({ text: 'Команда не найдена' })
    return
  }

  const adminText = `
📡 *ЗАЯВКА НА ПРОВЕРКУ ПОТОКА*
━━━━━━━━━━━━━━

Команда заявляет, что состоит в *Потоке №${flowNumber}*.

👤 *Владелец:* ${owner.fio || 'не указано'}
😎 *Юзернейм:* ${owner.username ? '@' + escapeUnderscore(owner.username) : 'не указано'}
🆔 *ID:* \`${userId}\`
👥 *Команда:* ${escapeUnderscore(team.name)}
🆔 *Team ID:* \`${teamId}\`

\`FLOW_NUMBER:${flowNumber}\`

━━━━━━━━━━━━━━
Проверь, действительно ли эта команда состоит в потоке!
`.trim()

  const kb = new InlineKeyboard()
    .text('✅ Подтвердить', packCb({ a: 'prop_verify_accept', p: `${teamId}:${flowNumber}` }))
    .text('❌ Отклонить', packCb({ a: 'prop_verify_reject', p: teamId }))
    .row()
    .url('Написать юзеру', `tg://user?id=${userId}`)

  await ctx.api.sendMessage(ADMIN_GROUP_ID, adminText, {
    parse_mode: 'Markdown',
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
  await addToWaitlist(teamId, userId)

  const team = await getTeamById(teamId)
  const owner = await getOrCreateUser(userId)

  const waitlist = await getPendingWaitlist()

  const kb = new InlineKeyboard().url('Написать юзеру', `tg://user?id=${userId}`)

  await ctx.api.sendMessage(
    ADMIN_GROUP_ID,
    `📋 *Новая заявка в лист ожидания ProPresenter*\n\n` +
      `👤 ${owner.fio || 'не указано'}\n` +
      `👥 Команда: ${team?.name || 'неизвестно'}\n` +
      `🆔 Team ID: \`${teamId}\`\n\n` +
      `Сейчас в очереди: *${waitlist.length}* заявок.\n\n` +
      `Когда наберётся достаточно людей — создай новый поток и назначь их вручную.`,
    {
      parse_mode: 'Markdown',
      message_thread_id: PROP_WAITLIST_THREAD_ID,
      reply_markup: kb,
    }
  )

  await ctx.editMessageCaption({
    caption:
      '✅ *Вы добавлены в лист ожидания!*\n\n' +
      'Как только откроется новый поток ProPresenter, мы вам сообщим и выдадим доступ.',
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🏠 Главное меню', packCb({ a: 'home' })),
  })

  await ctx.answerCallbackQuery({ text: 'Заявка отправлена ✓' })
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
