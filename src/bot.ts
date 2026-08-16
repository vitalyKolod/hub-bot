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
  handleAdminPanelCallback,
  handleAdminPanelText,
} from './handlers/adminPanel.handlers.js'
import { apCb } from './constants/admin-panel.js'

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

    adminMode?: 'broadcast' | 'waiting_broadcast'
    broadcastDraft?: {
      type: 'text' | 'photo' | 'video' | 'document'
      text?: string
      fileId?: string
    }
    inSupportMode?: boolean
    isExtension: boolean

    supportThreadId?: number

    adminPanelInput?: any
  }>

export function registerHandlers(bot: Bot<MyContext>) {
  initScreens()

  bot.use(
    session({
      initial: () => ({
        payment: null,
      }),
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
    ctx.session.inSupportMode = true
    ctx.session.supportThreadId = undefined
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
      ctx.session.adminMode = 'waiting_broadcast'

      await ctx.reply(
        `
📢 **Режим рассылки**

Отправьте в этот чат сообщение, которое нужно разослать пользователям.
*Поддерживается всё:* текст, фото, видео, документы, альбомы (медиагруппы) и форматирование.
`,
        { parse_mode: 'Markdown' }
      )

      await ctx.answerCallbackQuery()
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
      ctx.session.inSupportMode = true
      ctx.session.supportThreadId = undefined
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

      ctx.session.payment = {
        product: productId,
        teamId,
        method: null,
      }
      goTo(userId, 'payment')
      await renderScreen(ctx, userId, 'payment')
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

  // ====================== СООБЩЕНИЯ ======================
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const profile = await getOrCreateUser(userId)
    if (await handleAdminPanelText(ctx)) return

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
      let threadId = ctx.session.supportThreadId
      if (!threadId) {
        const username = ctx.from.username ? `@${ctx.from.username}` : `ID:${userId}`
        const profile = await getOrCreateUser(userId)
        const userInfo = `🆘 Новое обращение\n👤 ${profile.fio || 'не указано'}\nID: ${userId}`

        try {
          const topic = await ctx.api.createForumTopic(SUPPORT_GROUP_ID, `Поддержка — ${username}`)
          threadId = topic.message_thread_id
          ctx.session.supportThreadId = threadId
          await ctx.api.sendMessage(SUPPORT_GROUP_ID, userInfo, { message_thread_id: threadId })
        } catch (err) {
          console.error('Ошибка создания темы поддержки:', err)
        }
      }
      try {
        await ctx.copyMessage(SUPPORT_GROUP_ID, { message_thread_id: threadId })
      } catch (err) {
        console.error('Ошибка копирования текста:', err)
      }
      return
    }

    if (ctx.session.adminMode === 'broadcast') {
      if (!isAdmin(ctx.from.id)) return

      const text = ctx.message.text

      const users = await UserModel.find({
        reg: 'done',
      })

      let success = 0
      let failed = 0

      for (const user of users) {
        try {
          await ctx.api.sendMessage(user.telegramId, text)
          success++
        } catch {
          failed++
        }
      }

      ctx.session.adminMode = undefined

      await ctx.reply(`
✅ Рассылка завершена

Отправлено: ${success}
Ошибок: ${failed}
`)

      return
    }
  })

  // ====================== РАССЫЛКА ДЛЯ АДМИНА ======================
  bot.on('message', async (ctx, next) => {
    // Проверяем, что сообщение от админа и включен режим рассылки
    if (!ctx.from || !isAdmin(ctx.from.id)) return next()
    if (ctx.session.adminMode !== 'waiting_broadcast') return next()

    // Игнорируем сообщения из групп поддержки/админки, если они не относятся к рассылке в ЛС
    // (тут проверяем, что это личка с ботом или админ шлет в ЛС)
    if (ctx.chat.type !== 'private') return next()

    ctx.session.adminMode = undefined

    const users = await UserModel.find({ reg: 'done' })

    let success = 0
    let failed = 0

    await ctx.reply(`⏳ Начинаю рассылку для ${users.length} пользователей...`)

    for (const user of users) {
      try {
        // copyMessage идеально копирует текст, фото, видео, документы и подписи к ним в том же виде
        await ctx.api.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id, {
          reply_markup: ctx.message.reply_markup, // сохраняет инлайн-кнопки, если они были прикреплены
        })
        success++
        // Небольшая задержка, чтобы не упереться в лимиты Telegram API (flood control: ~30 сообщений в секунду)
        await new Promise((resolve) => setTimeout(resolve, 35))
      } catch (err) {
        failed++
      }
    }

    await ctx.reply(
      `
✅ **Рассылка завершена**

Успешно отправлено: ${success}
Ошибок (заблокировали бота / удалили аккаунт): ${failed}
`,
      { parse_mode: 'Markdown' }
    )
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

    // Если не чек — проверяем поддержку
    if (ctx.session.inSupportMode) {
      let threadId = ctx.session.supportThreadId
      if (!threadId) {
        const username = ctx.from.username ? `@${ctx.from.username}` : `ID:${ctx.from.id}`
        try {
          const topic = await ctx.api.createForumTopic(SUPPORT_GROUP_ID, `Поддержка — ${username}`)
          threadId = topic.message_thread_id
          ctx.session.supportThreadId = threadId
        } catch (err) {
          console.error('Ошибка создания темы:', err)
        }
      }
      try {
        await ctx.copyMessage(SUPPORT_GROUP_ID, { message_thread_id: threadId })
      } catch (err) {
        console.error('Ошибка копирования медиа:', err)
      }
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

  // Пересылка от админа к юзеру
  bot.on('message', async (ctx) => {
    if (ctx.chat?.id !== SUPPORT_GROUP_ID) return
    if (!ctx.from || ctx.from.is_bot) return

    const threadId = ctx.message.message_thread_id
    if (!threadId) return

    // Ищем ID пользователя по первому сообщению темы
    const firstMsg = ctx.message.reply_to_message
    if (firstMsg) {
      const textOrCaption = firstMsg.text || firstMsg.caption || ''
      const match = textOrCaption.match(/ID:\s*(\d+)/i)
      if (match) {
        const userId = Number(match[1])
        try {
          await ctx.forwardMessage(userId)
          console.log(`Сообщение от админа переслано юзеру ${userId}`)
        } catch (err) {
          console.error('Не удалось переслать юзеру:', err)
        }
      }
    }
  })
  setInterval(
    async () => {
      console.log('⏰ Проверка напоминаний...')
      await runReminders(bot)
    },
    1000 * 60 * 60 * 24
  ) // раз в сутки
}
console.log('✅ Бот запущен')
