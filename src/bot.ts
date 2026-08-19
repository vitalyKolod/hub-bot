import { PROP_FLOWS } from './data/ProPresenterFLows.js'
import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from 'grammy'
import {
  ONBOARDING_ASSET,
  getOnboardingCaption,
  getOnboardingKeyboard,
  isOnboardingCallback,
  parseOnboardingCallback,
} from './ui/onboarding.js'

import { initScreens } from './screens/index.js'
import { renderScreen } from './core/render.js'
import { packCb, parseCb } from './core/callback.js'
import { goTo, goBack, goHome } from './state/ui.js'
import {
  // activateContentSubscription,
  activateOrExtendContentSubscription,
  clearInputMode,
  setInputMode,
} from './services/user.service.js'
import {
  startRegistration,
  handleRegistrationText,
  finishRegistration,
} from './flows/registration/index.js'

import dotenv from 'dotenv'
import { getOrCreateUser } from './services/user.service.js'
import { activateVolunteer } from './services/volunteer.service.js'
import { UserModel } from './models/User.js'
import { runReminders } from './services/reminder.service.js'
dotenv.config()
import { escapeUnderscore } from './utils/escape.js'
import { isAdmin } from './config/admin.js'
import { handleSubscribeCheck, showSubscribeScreen } from './flows/subscribe/index.js'
import { INPUT_MODES } from './constants/input-modes.js'
import { createTeam } from './services/team.service.js'

import {
  addToCart,
  removeFromCart,
  getOrCreateCart,
  getPendingItems,
  getCartTotal,
  markCartInReview,
  setCartItemStatus,
  findCartItemByItemId,
  removeFromCartByItemId,
} from './services/cart.service.js'
import { getProduct } from './config/products.js'
import {
  activateTeamSubscription,
  rejectTeamSubscription,
  getTeamById,
  isOwner,
} from './services/team.service.js'
import { createTeamInvite } from './services/teamInvite.service.js'
import { addToWaitlist, getPendingWaitlist } from './services/proPresenterWaitlist.service.js'
import { getStreamByNumber } from './services/proPresenterStream.service.js'
import { handleBack, handleHome, handleOpen } from './handlers/navigation.hadlers.js'
import {
  handleConfirmRegistration,
  handleEditField,
  handleEditingFieldText,
  handleEditRegistration,
} from './handlers/registration.handlers.js'
import {
  handleAcceptTeamInvite,
  handleCreateTeamStart,
  handleCreateTeamText,
  handleDeclineTeamInvite,
} from './handlers/team.hadler.js'
import {
  handleAddToCart,
  handleCartAccept,
  handleCartReject,
  handleCheckoutCart,
  handleRemoveFromCart,
} from './handlers/cart.handlers.js'
import {
  handlePropConfirmStream,
  handlePropHasStream,
  handlePropNoStream,
  handlePropNoStreamConfirm,
  handlePropSelectStream,
  handlePropVerifyAccept,
  handlePropVerifyReject,
} from './handlers/propresenter.handlers.js'
import {
  handleAdminAccept,
  handleAdminReject,
  handleCryptoNetwork,
  handleCryptoSelected,
  handlePaid,
  handlePayMethod,
  handlePayProduct,
  handleReceiptUpload,
  handleRubBank,
  handleRubCardType,
  handleRubType,
} from './handlers/payment.handlers.js'

import {
  showAdminPanelMenu,
  showAdminTeamCard,
  showAdminUserCard,
  handleAdminPanelCallback,
  handleAdminPanelText,
} from './handlers/adminPanel.handlers.js'
import { apCb } from './constants/admin-panel.js'
import {
  adminExtendTeamSub,
  adminGetAllStreams,
  adminGetUserIdsInStream,
  adminSetStreamExpiry,
} from './services/adminPanel.service.js'
import {
  closeOpenTicketForUser,
  closeSupportTicket,
  relayAdminMessage,
  sendUserMessageToSupport,
} from './services/support.service.js'

const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID)
const CONTENT_GROUP_ID = Number(process.env.CONTENT_GROUP_ID)
const SUPPORT_GROUP_ID = Number(process.env.SUPPORT_GROUP_ID)
const SUNDAY_SCREENS_GROUP_ID = Number(process.env.SUNDAY_SCREENS_GROUP_ID)
const PROP_WAITLIST_THREAD_ID = Number(process.env.PROP_WAITLIST_THREAD_ID)
const PROP_STREAM_VERIFY_THREAD_ID = Number(process.env.PROP_STREAM_VERIFY_THREAD_ID)

if (!PROP_STREAM_VERIFY_THREAD_ID) {
  console.error('PROP_STREAM_VERIFY_THREAD_ID не задан в .env')
  process.exit(1)
}

if (!PROP_WAITLIST_THREAD_ID) {
  console.error('PROP_WAITLIST_THREAD_ID не задан в .env')
  process.exit(1)
}

if (!SUNDAY_SCREENS_GROUP_ID) {
  console.error('SUNDAY_SCREENS_GROUP_ID не задан')
  process.exit(1)
}

if (!ADMIN_GROUP_ID) {
  console.error('ADMIN_GROUP_ID не задан в .env')
  process.exit(1)
}
if (!CONTENT_GROUP_ID) {
  console.error('CONTENT_GROUP_ID не задан в .env')
  process.exit(1)
}
if (!SUPPORT_GROUP_ID) {
  console.error('SUPPORT_GROUP_ID не задан в .env')
  process.exit(1)
}
console.log(`🆘 Группа поддержки: ${SUPPORT_GROUP_ID}`)

type MyContext = Context &
  SessionFlavor<{
    payment: null | {
      product: string
      method: string | null
      volunteerId?: number
      rubMethod?: string | null
      network?: string
      rubType?: 'card' | 'sbp'
      rubCardType?: 'mir' | 'mastercard'
      rubBank?: 'tbank' | 'ozon' | 'alfa'
    }
    // volunteer:
    //   ownerId: number
    //   expiresAt: Date
    // }
    waitingForReceipt?: boolean
    volunteerId?: number
    waitingForVolunteer?: boolean
    editingField?: 'fio' | 'city' | 'church' | 'prop_stream_no' | 'screens_end_date'

    adminMode?: 'waiting_broadcast'
    broadcastDraft?: {
      audience: 'all' | 'stream'
      flowNumber?: number
      sourceChatId?: number
      messageIds: number[]
      mediaGroupId?: string
      isSending?: boolean
    }
    inSupportMode?: boolean
    isExtension: boolean

    supportThreadId?: number
    supportPanelMessageId?: number

    adminPanelInput?: any
  }>

const broadcastAlbumTimers = new Map<string, ReturnType<typeof setTimeout>>()

function broadcastAudienceLabel(draft?: MyContext['session']['broadcastDraft']) {
  return draft?.audience === 'stream' ? `поток #${draft.flowNumber}` : 'все пользователи'
}

function broadcastCancelKeyboard() {
  return new InlineKeyboard()
    .text('‹ Назад', 'admin:broadcast')
    .text('✖️ Отмена', 'admin:broadcast:cancel')
}

async function showBroadcastAudience(ctx: MyContext) {
  ctx.session.adminMode = undefined
  ctx.session.broadcastDraft = undefined
  const kb = new InlineKeyboard()
    .text('👥 Всем пользователям', 'admin:broadcast:all')
    .row()
    .text('📡 Отдельному потоку', 'admin:broadcast:streams')
    .row()
    .text('‹ В админку', 'admin:broadcast:cancel')
  await ctx.editMessageText('📢 Кому отправить рассылку?', { reply_markup: kb }).catch(() =>
    ctx.reply('📢 Кому отправить рассылку?', { reply_markup: kb })
  )
}

async function showBroadcastStreams(ctx: MyContext) {
  const streams = await adminGetAllStreams()
  const kb = new InlineKeyboard()
  for (const stream of streams) {
    kb.text(`Поток #${stream.flowNumber}`, `admin:broadcast:stream:${stream.flowNumber}`).row()
  }
  kb.text('‹ Назад', 'admin:broadcast').text('✖️ Отмена', 'admin:broadcast:cancel')
  await ctx.editMessageText(
    streams.length ? 'Выбери поток:' : 'Потоков пока нет.',
    { reply_markup: kb }
  ).catch(() =>
    ctx.reply(streams.length ? 'Выбери поток:' : 'Потоков пока нет.', { reply_markup: kb })
  )
}

async function promptBroadcastMessage(
  ctx: MyContext,
  audience: 'all' | 'stream',
  flowNumber?: number
) {
  ctx.session.adminMode = 'waiting_broadcast'
  ctx.session.broadcastDraft = { audience, flowNumber, messageIds: [] }
  const text =
    `📢 Получатели: ${broadcastAudienceLabel(ctx.session.broadcastDraft)}.\n\n` +
    'Пришли сообщение для черновика. Поддерживаются текст, фото, альбомы, видео, аудио, голосовые, документы, анимации, стикеры и подписи с форматированием.'
  await ctx.editMessageText(text, { reply_markup: broadcastCancelKeyboard() }).catch(() =>
    ctx.reply(text, { reply_markup: broadcastCancelKeyboard() })
  )
}

async function showBroadcastDraftControls(ctx: MyContext) {
  const draft = ctx.session.broadcastDraft
  if (!draft?.messageIds.length) return
  ctx.session.adminMode = undefined
  const kb = new InlineKeyboard()
    .text('👁 Предпросмотр', 'admin:broadcast:preview')
    .row()
    .text('➕ Добавить ещё', 'admin:broadcast:add')
    .row()
    .text('✏️ Заменить', 'admin:broadcast:edit')
    .text('✖️ Отмена', 'admin:broadcast:cancel')
  await ctx.reply(
    `✅ Черновик сохранён (${draft.messageIds.length > 1 ? `${draft.messageIds.length} сообщений` : '1 сообщение'}).\nПолучатели: ${broadcastAudienceLabel(draft)}.`,
    { reply_markup: kb }
  )
}

async function copyBroadcastDraft(ctx: MyContext, targetChatId: number) {
  const draft = ctx.session.broadcastDraft
  if (!draft?.sourceChatId || !draft.messageIds.length) throw new Error('Черновик пуст')
  if (draft.messageIds.length === 1) {
    await ctx.api.copyMessage(targetChatId, draft.sourceChatId, draft.messageIds[0])
  } else {
    await ctx.api.copyMessages(targetChatId, draft.sourceChatId, draft.messageIds)
  }
}

async function getBroadcastRecipients(draft: NonNullable<MyContext['session']['broadcastDraft']>) {
  if (draft.audience === 'stream') return adminGetUserIdsInStream(draft.flowNumber!)
  const users = await UserModel.find({ reg: 'done' }).select({ telegramId: 1, _id: 0 }).lean()
  return users.map((user) => user.telegramId)
}

async function handleBroadcastCallback(ctx: MyContext, data: string) {
  if (!ctx.from || !isAdmin(ctx.from.id)) return
  if (data === 'admin:broadcast:all') return promptBroadcastMessage(ctx, 'all')
  if (data === 'admin:broadcast:streams') return showBroadcastStreams(ctx)
  if (data.startsWith('admin:broadcast:stream:')) {
    return promptBroadcastMessage(ctx, 'stream', Number(data.split(':')[3]))
  }
  if (data === 'admin:broadcast:cancel') {
    ctx.session.adminMode = undefined
    ctx.session.broadcastDraft = undefined
    const kb = new InlineKeyboard().text('📢 Рассылка', 'admin:broadcast').row().text('✏️ Управление', apCb('menu'))
    return ctx.editMessageText('Панель администратора', { reply_markup: kb }).catch(() =>
      ctx.reply('Панель администратора', { reply_markup: kb })
    )
  }
  const draft = ctx.session.broadcastDraft
  if (!draft?.messageIds.length) return ctx.reply('Черновик не найден. Начни рассылку заново.')
  if (data === 'admin:broadcast:edit') {
    return promptBroadcastMessage(ctx, draft.audience, draft.flowNumber)
  }
  if (data === 'admin:broadcast:add') {
    if (draft.messageIds.length >= 100) {
      return ctx.reply('В одном черновике уже максимум — 100 сообщений.')
    }
    draft.mediaGroupId = undefined
    ctx.session.adminMode = 'waiting_broadcast'
    return ctx.reply('Пришли следующее сообщение или альбом для этого же черновика.', {
      reply_markup: broadcastCancelKeyboard(),
    })
  }
  if (data === 'admin:broadcast:preview') {
    await ctx.reply('👁 Так рассылка будет выглядеть у получателя:')
    await copyBroadcastDraft(ctx, ctx.chat!.id)
    const recipients = await getBroadcastRecipients(draft)
    const kb = new InlineKeyboard()
      .text(`🚀 Отправить (${recipients.length})`, 'admin:broadcast:send')
      .row()
      .text('➕ Добавить ещё', 'admin:broadcast:add')
      .row()
      .text('✏️ Заменить', 'admin:broadcast:edit')
      .text('✖️ Отмена', 'admin:broadcast:cancel')
    await ctx.reply(`Получатели: ${broadcastAudienceLabel(draft)} — ${recipients.length}.`, { reply_markup: kb })
    return
  }
  if (data === 'admin:broadcast:send') {
    if (draft.isSending) {
      await ctx.answerCallbackQuery({ text: 'Рассылка уже выполняется' }).catch(() => {})
      return
    }
    draft.isSending = true
    const recipients = await getBroadcastRecipients(draft)
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    await ctx.reply(`⏳ Начинаю рассылку для ${recipients.length} пользователей...`)
    let success = 0
    let failed = 0
    for (const telegramId of recipients) {
      try {
        await copyBroadcastDraft(ctx, telegramId)
        success++
      } catch (error) {
        failed++
        console.error(`Broadcast delivery failed for ${telegramId}:`, error)
      }
      // Альбом считается несколькими сообщениями и сильнее расходует лимит Telegram.
      await new Promise((resolve) => setTimeout(resolve, 40 * draft.messageIds.length))
    }
    ctx.session.broadcastDraft = undefined
    ctx.session.adminMode = undefined
    await ctx.reply(`✅ Рассылка завершена\n\nОтправлено: ${success}\nОшибок: ${failed}`)
  }
}

export function registerHandlers(bot: Bot<MyContext>) {
  initScreens()

  bot.use(
    session<MyContext['session'], Context>({
      initial: () => ({
        payment: null,
        isExtension: false,
      }),
      // В группах состояние должно быть отдельным для каждого администратора.
      // Иначе ввод одного сотрудника в админ-панели перехватит сообщение другого.
      getSessionKey: (ctx) =>
        ctx.chat?.id && ctx.from?.id ? `${ctx.chat.id}:${ctx.from.id}` : undefined,
    })
  )

  bot.command('start', async (ctx) => {
    const payload = ctx.match
    const userId = ctx.from.id

    if (payload && typeof payload === 'string' && payload.startsWith('join_')) {
      const code = payload.replace('join_', '')

      const { validateInvite } = await import('./services/teamInvite.service.js')
      const check = await validateInvite(code)

      if (!check.ok) {
        const reasonText: Record<string, string> = {
          not_found: '❌ Приглашение не найдено.',
          used: '❌ Эта ссылка уже была использована.',
          expired: '❌ Срок действия ссылки истёк (24 часа).',
          team_not_found: '❌ Команда не найдена.',
          team_full: '❌ Команда уже заполнена (максимум 5 участников).',
        }

        await ctx.reply(reasonText[check.reason] || '❌ Приглашение недействительно.')
        // не return — продолжаем обычный /start ниже
      } else {
        await UserModel.updateOne(
          { telegramId: userId },
          { pendingInviteCode: code },
          { upsert: true }
        )

        // 👇 НОВОЕ: если человек уже зарегистрирован — сразу показываем приглашение
        const profile = await getOrCreateUser(userId)
        if (profile.reg === 'done') {
          goTo(userId, 'team_invite')
          await renderScreen(ctx, userId, 'team_invite', code, { forceNew: true })
          return
        }
        // если ещё не зарегистрирован — падаем ниже, в обычный онбординг,
        // код уже сохранён и всплывёт после завершения регистрации
      }
    }

    const kb = new InlineKeyboard().text('СТАРТ', 'sub:check').style('success')
    const text = 'Привет! 🙂 Добро пожаловать в ХАБ 🟢\n\nНажми "СТАРТ", чтобы продолжить 🔵'

    await ctx.replyWithPhoto(ONBOARDING_ASSET, {
      caption: text,
      caption_entities: [
        {
          offset: text.indexOf('🙂'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5463249828450424568',
        },
        {
          offset: text.indexOf('🟢'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5379559474405092361',
        },
        {
          offset: text.indexOf('🔵'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5470177992950946662',
        },
      ],
      reply_markup: kb,
    })
  })

  bot.command('threadid', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return
    await ctx.reply(`Thread ID: ${ctx.message.message_thread_id || 'нет (это не топик)'}`)
  })

  bot.command('main', async (ctx) => {
    goHome(ctx.from.id)
    await renderScreen(ctx, ctx.from.id, 'main', undefined, { forceNew: true })
  })

  bot.command('profile', async (ctx) => {
    goTo(ctx.from.id, 'profile')
    await renderScreen(ctx, ctx.from.id, 'profile', undefined, { forceNew: true })
  })

  bot.command('team_list', async (ctx) => {
    goTo(ctx.from.id, 'team_list')
    await renderScreen(ctx, ctx.from.id, 'team_list', undefined, { forceNew: true })
  })

  bot.command('support', async (ctx) => {
    goTo(ctx.from.id, 'support')
    await renderScreen(ctx, ctx.from.id, 'support', undefined, { forceNew: true })
  })

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    const kb = new InlineKeyboard()
      .text('📢 Рассылка', 'admin:broadcast')
      .row()
      .text('✏️ Управление', apCb('menu'))

    await ctx.reply('Панель администратора', { reply_markup: kb })
  })

  // ====================== CALLBACK QUERY ======================
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    if (await handleAdminPanelCallback(ctx, data)) return

    const userId = ctx.from?.id
    if (!userId) return

    const ack = async () => {
      try {
        await ctx.answerCallbackQuery()
      } catch {}
    }

    console.log('callback data:', data)

    const message = ctx.callbackQuery.message

    if (data.startsWith('renew:')) {
      if (!isAdmin(userId)) {
        await ctx.answerCallbackQuery({ text: 'Нет прав', show_alert: true })
        return
      }

      const parts = data.split(':')
      const kind = parts[1]
      const expectedToken = parts.at(-1)
      let label = ''
      let newExpiry: Date

      if (kind === 'f') {
        const flowNumber = Number(parts[2])
        const stream = await getStreamByNumber(flowNumber)
        if (!stream?.expiresAt || stream.expiresAt.toISOString().slice(0, 10).replaceAll('-', '') !== expectedToken) {
          await ctx.answerCallbackQuery({ text: 'Уже продлено или дата изменена', show_alert: true })
          return
        }
        newExpiry = new Date(stream.expiresAt > new Date() ? stream.expiresAt : new Date())
        newExpiry.setFullYear(newExpiry.getFullYear() + 1)
        await adminSetStreamExpiry(flowNumber, newExpiry)
        label = `ProPresenter, поток №${flowNumber}`
      } else if (kind === 't') {
        const [, , teamId, productId] = parts
        const team = await getTeamById(teamId)
        if (!team) {
          await ctx.answerCallbackQuery({ text: 'Команда не найдена', show_alert: true })
          return
        }
        const subscription = team.subscriptions.get(productId)
        if (
          !subscription?.expiresAt ||
          subscription.expiresAt.toISOString().slice(0, 10).replaceAll('-', '') !== expectedToken
        ) {
          await ctx.answerCallbackQuery({ text: 'Уже продлено или дата изменена', show_alert: true })
          return
        }
        newExpiry = await adminExtendTeamSub(teamId, productId)
        label = `${getProduct(productId)?.name || productId}, команда «${team.name}»`
      } else {
        await ctx.answerCallbackQuery({ text: 'Неверная кнопка', show_alert: true })
        return
      }

      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
      await ctx.reply(`✅ ${label} продлена до ${newExpiry.toLocaleDateString('ru-RU')}`)
      await ctx.answerCallbackQuery({ text: 'Продлено на 1 год' })
      return
    }

    if (data.startsWith('support:profile:')) {
      if (ctx.chat?.id !== SUPPORT_GROUP_ID || !isAdmin(userId)) {
        await ctx.answerCallbackQuery({ text: 'Недостаточно прав', show_alert: true })
        return
      }
      const targetUserId = Number(data.slice('support:profile:'.length))
      await showAdminUserCard(ctx, targetUserId)
      await ctx.answerCallbackQuery()
      return
    }

    if (data.startsWith('support:team:')) {
      if (ctx.chat?.id !== SUPPORT_GROUP_ID || !isAdmin(userId)) {
        await ctx.answerCallbackQuery({ text: 'Недостаточно прав', show_alert: true })
        return
      }
      const teamId = data.slice('support:team:'.length)
      await showAdminTeamCard(ctx, teamId)
      await ctx.answerCallbackQuery()
      return
    }

    if (data === 'support:start') {
      ctx.session.inSupportMode = true
      await ctx.answerCallbackQuery({ text: 'Чат с поддержкой открыт' })
      await ctx.reply(
        '💬 Опишите вопрос одним или несколькими сообщениями. Можно отправлять фото, видео, документы и голосовые.\n\n👍 — сообщение доставлено поддержке\n👎 — отправка отменена из-за ошибки',
        {
          reply_markup: new InlineKeyboard().text('✅ Завершить диалог', 'support:close:user'),
        }
      )
      return
    }

    if (data === 'support:close:user') {
      const ticket = await closeOpenTicketForUser(ctx.api, userId)
      ctx.session.inSupportMode = false
      ctx.session.supportThreadId = undefined
      await ctx.answerCallbackQuery({
        text: ticket ? 'Обращение завершено' : 'Активных обращений нет',
      })
      await ctx.reply(
        ticket
          ? '✅ Диалог завершён. Спасибо за обращение! Если понадобится помощь — откройте новое обращение.'
          : 'У вас сейчас нет активного обращения.'
      )
      return
    }

    if (data.startsWith('support:close:')) {
      if (ctx.chat?.id !== SUPPORT_GROUP_ID) {
        await ctx.answerCallbackQuery({ text: 'Недостаточно прав', show_alert: true })
        return
      }
      const ticketId = data.slice('support:close:'.length)
      const ticket = await closeSupportTicket(ctx.api, ticketId, 'admin')
      await ctx.answerCallbackQuery({ text: ticket ? 'Обращение завершено' : 'Уже завершено' })
      if (ticket && ctx.session.supportPanelMessageId) {
        await ctx.api
          .deleteMessage(SUPPORT_GROUP_ID, ctx.session.supportPanelMessageId)
          .catch(() => {})
        ctx.session.supportPanelMessageId = undefined
      }
      if (ticket && message) {
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: undefined })
        } catch {}
      }
      return
    }

    //Редактирование поля
    if (data === 'edit_registration') {
      await handleEditRegistration(ctx)
      await ctx.answerCallbackQuery()
      return
    }

    if (data.startsWith('edit_field:')) {
      const field = data.split(':')[1]
      await handleEditField(ctx, field)
      await ctx.answerCallbackQuery()
      return
    }

    if (data === 'confirm_registration') {
      await handleConfirmRegistration(ctx, userId)
      await ctx.answerCallbackQuery()
      return
    }

    if (data === 'admin:broadcast') {
      if (!isAdmin(userId)) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа', show_alert: true })
        return
      }
      await showBroadcastAudience(ctx)
      await ctx.answerCallbackQuery()
      return
    }

    if (data.startsWith('admin:broadcast:')) {
      await handleBroadcastCallback(ctx, data)
      await ctx.answerCallbackQuery().catch(() => {})
      return
    }

    // ===== VERIFY FLOW =====
    if (data.startsWith('verify:')) {
      const [, type, userIdStr] = data.split(':')
      const targetUserId = Number(userIdStr)

      if (!targetUserId) return

      const user = await getOrCreateUser(targetUserId)

      if (type === 'reject') {
        await ctx.api.sendMessage(targetUserId, '❌ Ваши данные не прошли проверку')
        await ctx.answerCallbackQuery({ text: 'Отклонено' })
        return
      }
      if (type === 'reject_prop') {
        await UserModel.updateOne(
          { telegramId: targetUserId },
          {
            'subscriptions.propresenter.status': 'none',
            'subscriptions.propresenter.flow': undefined,
          }
        )

        await ctx.api.sendMessage(
          targetUserId,
          '❌ Поток ProPresenter не прошёл проверку\nСвяжитесь с админом для уточнения! \n\n Чтобы вернуться в профиль - нажмите /profile'
        )

        const updatedUser = await getOrCreateUser(targetUserId)

        await ctx.api.editMessageReplyMarkup(message.chat.id, message.message_id, {
          reply_markup: buildAdminKeyboard(updatedUser, targetUserId),
        })

        await ctx.answerCallbackQuery({ text: 'Отклонено' })
        return
      }
      if (type === 'reject_content') {
        await UserModel.updateOne(
          { telegramId: targetUserId },
          {
            'subscriptions.content.status': 'none',
            'subscriptions.content.expiresAt': undefined,
          }
        )

        await ctx.api.sendMessage(
          targetUserId,
          '❌ Контент не прошёл проверку\nСвяжитесь с админом для уточнения! \n\n Чтобы вернуться в профиль - нажмите /profile'
        )

        const updatedUser = await getOrCreateUser(targetUserId)

        await ctx.api.editMessageReplyMarkup(message.chat.id, message.message_id, {
          reply_markup: buildAdminKeyboard(updatedUser, targetUserId),
        })

        await ctx.answerCallbackQuery({ text: 'Отклонено' })
        return
      }

      if (type === 'prop') {
        const flow = user.subscriptions?.propresenter?.flow
        const flowData = PROP_FLOWS.find((f) => f.flow === Number(flow))

        if (!flowData) {
          await ctx.answerCallbackQuery({ text: 'Поток не найден' })
          return
        }

        await UserModel.updateOne(
          { telegramId: targetUserId },
          {
            'subscriptions.propresenter.status': 'active',
            'subscriptions.propresenter.email': flowData.email,
            'subscriptions.propresenter.password': flowData.password,
            'subscriptions.propresenter.chatFlow': flowData.chatFlow,
            'subscriptions.propresenter.expiresAt': flowData.expiresAt,
          }
        )

        await ctx.api.sendMessage(
          targetUserId,
          `✅ ProPresenter подтверждён! \n\n Чтобы вернуться в профиль - нажмите /profile`
        )

        await ctx.answerCallbackQuery({ text: 'ProPresenter активирован' })
      }

      if (type === 'content') {
        await UserModel.updateOne(
          { telegramId: targetUserId },
          {
            'subscriptions.content.status': 'active',
          }
        )

        await ctx.api.sendMessage(
          targetUserId,
          '✅ Подписка "Контент для экранов" подтверждена \n\n Чтобы вернуться в профиль - нажмите /profile'
        )

        await ctx.answerCallbackQuery({ text: 'Контент активирован' })
      }

      const updatedUser = await getOrCreateUser(targetUserId)

      await ctx.api.editMessageReplyMarkup(message.chat.id, message.message_id, {
        reply_markup: buildAdminKeyboard(updatedUser, targetUserId),
      })
    }

    // Админ-кнопки
    if (message && message.message_thread_id) {
      const parsed = parseCb(data)
      if (parsed) {
        const caption = message.caption || message.text || ''

        const userIdMatch = caption.match(/ID:\s*`?(\d+)`?/i) || caption.match(/\(ID:\s*(\d+)\)/i)
        if (!userIdMatch) {
          await ctx.answerCallbackQuery({ text: 'ID не найден' })
          return
        }

        const targetUserId = Number(userIdMatch[1])

        if (parsed.a === 'accept') {
          await handleAdminAccept(ctx, parsed.p as string, caption, message.message_id)
          return
        }

        if (parsed.a === 'reject') {
          await handleAdminReject(ctx, caption, message.message_id)
          return
        }
        if (parsed.a === 'prop_verify_accept') {
          await handlePropVerifyAccept(ctx, String(parsed.p), caption, message.message_id)
          return
        }

        if (parsed.a === 'prop_verify_reject') {
          await handlePropVerifyReject(ctx, String(parsed.p), caption, message.message_id)
          return
        }
      }
    }

    if (data === 'sub:check') {
      await showSubscribeScreen(ctx)
      await ctx.answerCallbackQuery()
      return
    }

    if (data === 'subscribe:check') {
      await handleSubscribeCheck(ctx)
      return
    }

    // Онбординг
    if (isOnboardingCallback(data)) {
      const onboardingParsed = parseOnboardingCallback(data)
      if (!onboardingParsed) return await ack()

      if (onboardingParsed.type === 'confirm') {
        const profile = await getOrCreateUser(userId)
        if (profile.reg !== 'done') {
          await startRegistration(ctx, userId)
        } else {
          goHome(userId)

          await renderScreen(ctx, userId, 'main')
        }
        await ack()
        return
      }

      await ctx.editMessageMedia({
        type: 'photo',
        media: ONBOARDING_ASSET,
        caption: getOnboardingCaption(onboardingParsed.step || 0),
        parse_mode: 'Markdown',
      })
      await ctx.editMessageReplyMarkup({
        reply_markup: getOnboardingKeyboard(onboardingParsed.step || 0),
      })
      await ack()
      return
    }

    const parsed = parseCb(data)
    if (!parsed) {
      await ack()
      return
    }

    // Поддержка
    if (parsed.a === 'open' && parsed.s === 'support') {
      goTo(userId, 'support')
      await renderScreen(ctx, userId, 'support')
      await ack()
      return
    }

    // if (parsed.a === 'end_support') {
    //   ctx.session.inSupportMode = false
    //   ctx.session.supportThreadId = undefined
    //   await ctx.reply('✅ Диалог с поддержкой завершён.\n\nНапиши /main чтобы вернуться в меню.')
    //   await ack()
    //   return
    // }

    // if (ctx.session.inSupportMode) {
    //   await ctx.answerCallbackQuery({ text: 'Вы в чате поддержки' })
    //   await ack()
    //   return
    // }

    if (parsed.a === 'create_team') {
      await handleCreateTeamStart(ctx, userId)
      await ack()
      return
    }

    if (parsed.a === 'accept_team_invite' && parsed.p) {
      await handleAcceptTeamInvite(ctx, userId, String(parsed.p))
      return
    }

    if (parsed.a === 'decline_team_invite' && parsed.p) {
      await handleDeclineTeamInvite(ctx, userId)
      return
    }

    if (parsed.a === 'prop_no_stream' && parsed.p) {
      await handlePropNoStream(ctx, userId, String(parsed.p))
      await ack()
      return
    }

    if (parsed.a === 'prop_has_stream' && parsed.p) {
      await handlePropHasStream(ctx, userId, String(parsed.p))
      await ack()
      return
    }

    if (parsed.a === 'prop_select_stream' && parsed.p) {
      await handlePropSelectStream(ctx, userId, String(parsed.p))
      await ack()
      return
    }

    if (parsed.a === 'prop_confirm_stream' && parsed.p) {
      await handlePropConfirmStream(ctx, userId, String(parsed.p))
      return
    }

    if (parsed.a === 'prop_no_stream_confirm' && parsed.p) {
      await handlePropNoStreamConfirm(ctx, userId, String(parsed.p))
      return
    }

    // Обычная навигация + оплата
    if (parsed.a === 'open' && parsed.s) {
      await handleOpen(ctx, userId, parsed)
      await ack()
      return
    }

    if (parsed.a === 'back') {
      await handleBack(ctx, userId)
      await ack()
      return
    }

    if (parsed.a === 'home') {
      await handleHome(ctx, userId)
      await ack()
      return
    }

    if (parsed.a === 'pay_product' && parsed.p) {
      const [productId, teamId] = String(parsed.p).split(':')
      await handlePayProduct(ctx, userId, productId, teamId)
      await ack()
      return
    }

    if (parsed.a === 'pay_method' && parsed.m) {
      ctx.session.payment = { ...ctx.session.payment, method: parsed.m }

      if (parsed.m === 'rub') {
        goTo(userId, 'rub_methods')
        await renderScreen(ctx, userId, 'rub_methods', null, ctx)
      } else if (parsed.m === 'crypto') {
        goTo(userId, 'crypto_payment')
        await renderScreen(ctx, userId, 'crypto_payment')
      }
      await ack()
      return
    }

    if (parsed.a === 'pay_product' && parsed.p) {
      const [productId, teamId] = String(parsed.p).split(':')
      await handlePayProduct(ctx, userId, productId, teamId)
      await ack()
      return
    }

    if (parsed.a === 'pay_method' && parsed.m) {
      await handlePayMethod(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'rub_type' && parsed.m) {
      await handleRubType(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'rub_card_type' && parsed.m) {
      await handleRubCardType(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'rub_bank' && parsed.m) {
      await handleRubBank(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'crypto_network' && parsed.m) {
      await handleCryptoNetwork(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'crypto_selected' && parsed.m) {
      await handleCryptoSelected(ctx, userId, parsed.m)
      await ack()
      return
    }

    if (parsed.a === 'paid') {
      await handlePaid(ctx)
      await ack()
      return
    }

    if (parsed.a === 'add_to_cart' && parsed.p) {
      const [productId, teamId] = String(parsed.p).split(':')
      await handleAddToCart(ctx, userId, productId, teamId)
      return
    }

    if (parsed.a === 'remove_from_cart' && parsed.p) {
      await handleRemoveFromCart(ctx, userId, String(parsed.p))
      await ack()
      return
    }

    if (parsed.a === 'checkout_cart' && parsed.p) {
      await handleCheckoutCart(ctx, userId, String(parsed.p))
      await ack()
      return
    }

    if (parsed.a === 'cart_accept' && parsed.p) {
      await handleCartAccept(ctx, String(parsed.p))
      return
    }

    if (parsed.a === 'cart_reject' && parsed.p) {
      await handleCartReject(ctx, String(parsed.p))
      return
    }

    await ack()

    if (parsed.a === 'add_volunteer_contact') {
      await ctx.reply('Нажмите на кнопку ниже и выберите волонтёра:', {
        reply_markup: {
          keyboard: [
            [
              {
                text: '📱 Выбрать волонтера',
                request_users: {
                  request_id: 1,
                  user_is_bot: false, // не боты
                  max_quantity: 1,
                },
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      })

      ctx.session.waitingForVolunteer = true

      await ack()
      return
    }
  })

  // Черновик рассылки должен перехватываться до более узких text/photo handlers.
  bot.on('message', async (ctx, next) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return next()
    if (ctx.session.adminMode !== 'waiting_broadcast') return next()
    if (ctx.chat.type !== 'private') return next()

    const draft = ctx.session.broadcastDraft
    if (!draft) {
      ctx.session.adminMode = undefined
      return next()
    }

    if (draft.messageIds.length >= 100) {
      ctx.session.adminMode = undefined
      await ctx.reply('В одном черновике можно отправить не больше 100 сообщений.')
      await showBroadcastDraftControls(ctx)
      return
    }

    const mediaGroupId = ctx.message.media_group_id
    if (draft.mediaGroupId && mediaGroupId !== draft.mediaGroupId) {
      await ctx.reply('Черновик уже содержит сообщение. Нажми «Предпросмотр» или «Заменить».')
      return
    }

    draft.sourceChatId = ctx.chat.id
    draft.mediaGroupId = mediaGroupId
    if (!draft.messageIds.includes(ctx.message.message_id)) {
      draft.messageIds.push(ctx.message.message_id)
      draft.messageIds.sort((a, b) => a - b)
    }

    if (!mediaGroupId) {
      await showBroadcastDraftControls(ctx)
      return
    }

    // Telegram присылает элементы альбома отдельными апдейтами. Ждём последний,
    // затем показываем одну панель управления для всей медиагруппы.
    const timerKey = `${ctx.chat.id}:${ctx.from.id}:${mediaGroupId}`
    const previousTimer = broadcastAlbumTimers.get(timerKey)
    if (previousTimer) clearTimeout(previousTimer)
    broadcastAlbumTimers.set(
      timerKey,
      setTimeout(async () => {
        broadcastAlbumTimers.delete(timerKey)
        try {
          await showBroadcastDraftControls(ctx)
        } catch (error) {
          console.error('Failed to finalize broadcast album draft:', error)
        }
      }, 1200)
    )
  })

  // ====================== СООБЩЕНИЯ ======================
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    // В топике поддержки ввод из админ-панели (дата, имя, статус и т.д.)
    // должен обрабатываться раньше, чем обычный ответ пользователю.
    if (await handleAdminPanelText(ctx)) return
    if (await relayAdminMessage(ctx)) return

    const profile = await getOrCreateUser(userId)

    if (ctx.session.editingField) {
      await handleEditingFieldText(ctx, userId)
      return
    }

    if (profile.reg === 'in_progress') {
      await handleRegistrationText(ctx, userId, ctx.message.text)
      return
    }

    if (profile.inputMode === INPUT_MODES.CREATE_TEAM) {
      await handleCreateTeamText(ctx, userId)
      return
    }

    if (ctx.session.inSupportMode) {
      try {
        await sendUserMessageToSupport(ctx, userId)
        try {
          await ctx.react('👍')
        } catch {}
      } catch (err) {
        console.error('Ошибка отправки в поддержку:', err)
        try {
          await ctx.react('👎')
        } catch {}
        await ctx.reply('⚠️ Не получилось отправить сообщение. Попробуйте ещё раз чуть позже.')
      }
      return
    }

  })

  // ========== ЧЕК (фото / документ) — ВЫСОКИЙ ПРИОРИТЕТ===========
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    console.log(
      '📸 PHOTO/DOCUMENT HANDLER FIRED, waitingForReceipt =',
      ctx.session.waitingForReceipt
    )

    if (ctx.session.waitingForReceipt) {
      await handleReceiptUpload(ctx)
      return
    }

    if (await relayAdminMessage(ctx)) return

    // Если не чек — проверяем поддержку
    if (ctx.session.inSupportMode) {
      try {
        await sendUserMessageToSupport(ctx, ctx.from.id)
        try {
          await ctx.react('👍')
        } catch {}
      } catch (err) {
        console.error('Ошибка отправки медиа:', err)
        try {
          await ctx.react('👎')
        } catch {}
        await ctx.reply('⚠️ Не получилось отправить файл. Попробуйте ещё раз чуть позже.')
      }
      return
    }
  })
  bot.on('message:users_shared', async (ctx) => {
    if (!ctx.session.waitingForVolunteer) return

    ctx.session.waitingForVolunteer = false

    const shared = ctx.message.users_shared
    if (!shared || !shared.users || shared.users.length === 0) {
      await ctx.reply('❌ Не удалось получить пользователя')
      return
    }

    const volunteerTelegramId = shared.users[0].user_id

    // Дальше твоя логика
    const volunteer = await getOrCreateUser(volunteerTelegramId)

    if (volunteer.reg !== 'done') {
      await ctx.reply('❌ Волонтёр ещё не прошёл регистрацию в боте')
      return
    }

    // Проверка canAddVolunteer и т.д.
    const { canAddVolunteer } = await import('./services/volunteer.service.js')
    const check = await canAddVolunteer(ctx.from.id, volunteerTelegramId)

    if (!check.ok) {
      await ctx.reply(`❌ ${check.reason || 'Нельзя добавить этого волонтёра'}`)
      return
    }

    // 💾 сохраняем в сессию
    ctx.session.payment = {
      product: 'volunteer',
      method: null,
      volunteerId: volunteerTelegramId,
    }

    await ctx.reply(`✅ Волонтёр выбран: ${volunteer.fio || 'Без имени'}\n\nПереходим к оплате...`)

    // 👉 переход в оплату
    goTo(ctx.from.id, 'payment')
    await renderScreen(ctx, ctx.from.id, 'payment', undefined, { forceNew: true })
  })

  // Остальные типы сообщений поддержки: видео, голосовые, кружки, стикеры и т.д.
  bot.on('message', async (ctx) => {
    if (await relayAdminMessage(ctx)) return
    if (ctx.chat.type !== 'private' || !ctx.from || !ctx.session.inSupportMode) return

    try {
      await sendUserMessageToSupport(ctx, ctx.from.id)
      try {
        await ctx.react('👍')
      } catch {}
    } catch (error) {
      console.error('Ошибка отправки сообщения поддержки:', error)
      try {
        await ctx.react('👎')
      } catch {}
      await ctx.reply('⚠️ Этот тип сообщения не удалось отправить. Попробуйте текст или файл.')
    }
  })
  const checkSubscriptions = async () => {
    console.log('⏰ Проверка подписок и напоминаний...')
    await runReminders(bot).catch((error) => console.error('Ошибка проверки подписок:', error))
  }
  void checkSubscriptions()
  setInterval(checkSubscriptions, 1000 * 60 * 60 * 24)
}
console.log('✅ Бот запущен')
