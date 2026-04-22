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
} from './services/user.service.js'
import { startRegistration, handleRegistrationText } from './flows/registration.js'

import dotenv from 'dotenv'
import { getOrCreateUser } from './services/user.service.js'
import { activateVolunteer } from './services/volunteer.service.js'
import { UserModel } from './models/User.js'
import { runReminders } from './services/reminder.service.js'
dotenv.config()

const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID)
const CONTENT_GROUP_ID = Number(process.env.CONTENT_GROUP_ID)
const SUPPORT_GROUP_ID = Number(process.env.SUPPORT_GROUP_ID)
const SUNDAY_SCREENS_GROUP_ID = Number(process.env.SUNDAY_SCREENS_GROUP_ID)

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
    // volunteer: {
    //   ownerId: number
    //   expiresAt: Date
    // }
    waitingForReceipt?: boolean
    volunteerId?: number
    waitingForVolunteer?: boolean
    inSupportMode?: boolean
    isExtension: boolean

    supportThreadId?: number
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
    const kb = new InlineKeyboard().text('СТАРТ', 'ui:onb:start').style('success')

    // Добавляем placeholders для всех emoji в тексте
    const text = 'Привет! 🙂 Добро пожаловать в ХАБ 🟢\n\nНажми “СТАРТ”, чтобы продолжить 🔵'

    await ctx.replyWithPhoto(ONBOARDING_ASSET, {
      caption: text,
      caption_entities: [
        {
          offset: text.indexOf('🙂'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5463249828450424568', // первая иконка
        },
        {
          offset: text.indexOf('🟢'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5296665364346727584', // вторая иконка после "ХАБ"
        },
        {
          offset: text.indexOf('🔵'),
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5470177992950946662', // третья иконка после "продолжить"
        },
      ],
      reply_markup: kb,
    })
  })

  bot.command('main', async (ctx) => {
    goHome(ctx.from.id)
    await renderScreen(ctx, ctx.from.id, 'main', undefined, { forceNew: true })
  })

  bot.command('profile', async (ctx) => {
    goTo(ctx.from.id, 'profile')
    await renderScreen(ctx, ctx.from.id, 'profile', undefined, { forceNew: true })
  })

  bot.command('support', async (ctx) => {
    ctx.session.inSupportMode = true
    ctx.session.supportThreadId = undefined
    goTo(ctx.from.id, 'support')
    await renderScreen(ctx, ctx.from.id, 'support', undefined, { forceNew: true })
  })

  // ====================== CALLBACK QUERY ======================
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const userId = ctx.from?.id
    if (!userId) return

    const ack = async () => {
      try {
        await ctx.answerCallbackQuery()
      } catch {}
    }

    console.log('callback data:', data)

    const message = ctx.callbackQuery.message

    // ===== VERIFY FLOW =====
    if (data.startsWith('verify:')) {
      const [, type, userIdStr] = data.split(':')
      const targetUserId = Number(userIdStr)

      if (!targetUserId) return

      const user = await getOrCreateUser(targetUserId)

      // --- REJECT ---
      if (type === 'reject') {
        await ctx.api.sendMessage(targetUserId, '❌ Ваши данные не прошли проверку')

        await ctx.answerCallbackQuery({ text: 'Отклонено' })
        return
      }

      // --- PROPRESENTER ---
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
          `✅ ProPresenter подтверждён! Все отоброжается в профиле \n*Нажми /profile чтобы вернуться.*`
        )

        await ctx.answerCallbackQuery({ text: 'ProPresenter активирован' })
      }

      // --- CONTENT ---
      if (type === 'content') {
        await UserModel.updateOne(
          { telegramId: targetUserId },
          {
            'subscriptions.content.status': 'active',
          }
        )

        await ctx.api.sendMessage(targetUserId, '✅ Подписка "Контент для экранов" подтверждена')

        await ctx.answerCallbackQuery({ text: 'Контент активирован' })
        return
      }
    }

    // Админ-кнопки
    if (message && message.message_thread_id) {
      const parsed = parseCb(data)
      if (parsed) {
        const caption = message.caption || ''

        const userIdMatch = caption.match(/ID:\s*(\d+)/i) || caption.match(/\(ID:\s*(\d+)\)/i)
        if (!userIdMatch) {
          await ctx.answerCallbackQuery({ text: 'ID не найден' })
          return
        }

        const targetUserId = Number(userIdMatch[1])

        if (parsed.a === 'accept') {
          try {
            const volunteerMatch = caption.match(/ID волонт[её]ра:\s*(\d+)/i)
            const volunteerId = volunteerMatch ? Number(volunteerMatch[1]) : null

            if (volunteerId) {
              // 1. активируем волонтёра
              const { activateVolunteer } = await import('./services/volunteer.service.js')

              await activateVolunteer(targetUserId, volunteerId)

              // 2. создаем ссылку
              const invite = await ctx.api.createChatInviteLink(CONTENT_GROUP_ID, {
                member_limit: 1,
                name: `Ссылка для волонтёра ${volunteerId}`,
                expire_date: Math.floor(Date.now() / 1000) + 1800,
              })

              // 3. отправляем ВОЛОНТЁРУ
              await ctx.api.sendMessage(
                volunteerId,
                `
🎉 *Вам выдан доступ!*

Вы добавлены как волонтёр.

Вот ссылка в группу:
${invite.invite_link}

Ссылка одноразовая.
`.trim(),
                { parse_mode: 'Markdown' }
              )

              // 4. уведомляем владельца
              await ctx.api.sendMessage(
                targetUserId,
                `
✅ Волонтёр успешно добавлен!

Теперь он имеет доступ к контенту.
`.trim(),
                { parse_mode: 'Markdown' }
              )

              // 5. обновляем сообщение админу
              await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), message.message_id, {
                caption: `${caption}\n\n✅ Волонтёр добавлен`,
              })

              await ctx.answerCallbackQuery({ text: 'Волонтёр добавлен ✓' })
              return
            }

            const result = await activateOrExtendContentSubscription(targetUserId)

            // если новая подписка → даём ссылку
            // создаём ссылку Sunday Screens ВСЕГДА
            const sundayInvite = await ctx.api.createChatInviteLink(SUNDAY_SCREENS_GROUP_ID, {
              member_limit: 1,
              expire_date: Math.floor(Date.now() / 1000) + 1800,
            })

            // если новая подписка → даём ОБЕ ссылки
            if (result.type === 'activated') {
              const contentInvite = await ctx.api.createChatInviteLink(CONTENT_GROUP_ID, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 1800,
              })

              await ctx.api.sendMessage(
                targetUserId,
                `
✅ *Подписка активирована!*

📦 Контент для экранов:
${contentInvite.invite_link}

🎬 Sunday Screens:
${sundayInvite.invite_link}
`,
                { parse_mode: 'Markdown' }
              )
            } else {
              // продление → только Sunday Screens
              await ctx.api.sendMessage(
                targetUserId,
                `
🔄 Подписка на ProContent продлена!

🎬 Вам доступна подписка Sunday Screens:

Вот ссылка 👇
${sundayInvite.invite_link}


Чтобы посмотреть Ваши подписки - нажмите /profile
`,
                { parse_mode: 'Markdown' }
              )
            }

            await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), message.message_id, {
              caption: `${caption}\n\n✅ Принято! Ссылка отправлена. Подписка активирована на 1 год.`,
              parse_mode: 'Markdown',
            })

            await ctx.answerCallbackQuery({ text: 'Принято ✓' })
            return
          } catch (err: any) {
            console.error('Ошибка accept:', err)
            await ctx.answerCallbackQuery({ text: 'Ошибка' })
            return
          }
        }

        if (parsed.a === 'reject') {
          try {
            await ctx.api.sendMessage(targetUserId, '❌ Оплата отклонена. Свяжитесь с поддержкой.')
            await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), message.message_id, {
              caption: `${caption}\n\n❌ Отклонено`,
            })
            await ctx.answerCallbackQuery({ text: 'Отклонено ✗' })
            return
          } catch (err: any) {
            console.error('Ошибка reject:', err)
            await ctx.answerCallbackQuery({ text: 'Ошибка' })
            return
          }
        }
      }
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

    // Обычная навигация + оплата
    if (parsed.a === 'open' && parsed.s) {
      goTo(userId, parsed.s)
      await renderScreen(ctx, userId, parsed.s, parsed.p)
      await ack()
      return
    }

    if (parsed.a === 'back') {
      const prev = goBack(userId)
      await renderScreen(ctx, userId, prev)
      await ack()
      return
    }

    if (parsed.a === 'home') {
      goHome(userId)
      await renderScreen(ctx, userId, 'main')
      await ack()
      return
    }

    if (parsed.a === 'pay_product' && parsed.p) {
      const user = await getOrCreateUser(userId)

      const isExtension =
        parsed.p === 'content_screens' && user.subscriptions?.content?.status === 'active'

      ctx.session.payment = {
        product: parsed.p,
        method: null,
        isExtension,
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

    if (parsed.a === 'rub_type' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        method: 'rub',
        rubType: parsed.m,
      }

      if (parsed.m === 'card') {
        goTo(userId, 'rub_card_methods')
        await renderScreen(ctx, userId, 'rub_card_methods')
      } else {
        goTo(userId, 'rub_sbp_methods')
        await renderScreen(ctx, userId, 'rub_sbp_methods')
      }

      await ack()
      return
    }
    if (parsed.a === 'rub_card_type' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        rubCardType: parsed.m,
      }

      if (parsed.m === 'mastercard') {
        // сразу на оплату
        goTo(userId, 'rub_payment')
        await renderScreen(ctx, userId, 'rub_payment', ctx.session.payment)
      } else {
        // МИР → выбираем банк
        goTo(userId, 'rub_sbp_methods')
        await renderScreen(ctx, userId, 'rub_sbp_methods')
      }

      await ack()
      return
    }

    if (parsed.a === 'rub_bank' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        rubBank: parsed.m,
      }

      goTo(userId, 'rub_payment')
      await renderScreen(ctx, userId, 'rub_payment', ctx.session.payment)

      await ack()
      return
    }

    if (parsed.a === 'crypto_network' && parsed.m) {
      ctx.session.payment = { ...ctx.session.payment, network: parsed.m }
      goTo(userId, 'crypto_method')
      await renderScreen(ctx, userId, 'crypto_method')
      await ack()
      return
    }
    if (parsed.a === 'crypto_selected' && parsed.m) {
      ctx.session.payment = { ...ctx.session.payment, network: parsed.m }
      goTo(userId, 'crypto_payment')
      await renderScreen(ctx, userId, 'crypto_payment', {
        network: parsed.m,
        product: ctx.session.payment?.product,
      })
      await ack()
      return
    }

    if (parsed.a === 'paid') {
      await ctx.editMessageCaption({
        caption:
          '📸 Отлично! Теперь пришли фото чека (или документ) в этот чат.\nЯ сразу передам админу.',
        reply_markup: new InlineKeyboard().text('Отмена', packCb({ a: 'back' })),
        parse_mode: 'Markdown',
      })
      ctx.session.waitingForReceipt = true
      await ack()
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

    if (profile.reg === 'in_progress') {
      await handleRegistrationText(ctx, userId, ctx.message.text)
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
  })

  // ========== ЧЕК (фото / документ) — ВЫСОКИЙ ПРИОРИТЕТ===========
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    if (ctx.session.waitingForReceipt) {
      ctx.session.waitingForReceipt = false

      const userId = ctx.from.id
      const profile = await getOrCreateUser(userId)
      const username = ctx.from.username ? `@${ctx.from.username}` : `ID:${ctx.from.id}`

      // const userLink = ctx.from.username
      //   ? `@${ctx.from.username}`
      //   : `[Открыть профиль](tg://user?id=${userId})`

      let methodText = ''

      if (ctx.session.payment?.method === 'crypto' || ctx.session.payment?.network) {
        const net = ctx.session.payment?.network || 'TRC20'
        methodText = `Крипта (${net.toUpperCase()})`
      } else {
        const bankMap: any = {
          tbank: 'Т-Банк',
          ozon: 'Озон-Банк',
          alfa: 'Альфа-Банк',
        }

        const bank = bankMap[ctx.session.payment?.rubBank] || 'Не указан'

        if (ctx.session.payment?.rubType === 'sbp') {
          methodText = `Рубли — СБП (${bank})`
        }

        if (ctx.session.payment?.rubType === 'card') {
          if (ctx.session.payment?.rubCardType === 'mastercard') {
            methodText = `Рубли — Карта (MasterCard)`
          } else {
            methodText = `Рубли — Карта МИР (${bank})`
          }
        }
      }

      let volunteerText = ''

      if (ctx.session.payment?.volunteerId) {
        try {
          const volunteer = await getOrCreateUser(ctx.session.payment.volunteerId)

          volunteerText = `
🙋 Волонтёр: ${volunteer.fio || 'не указано'}
🆔 ID волонтёра: ${ctx.session.payment.volunteerId}
`
        } catch {
          volunteerText = `\n🙋 Волонтёр ID: ${ctx.session.payment.volunteerId}`
        }
      }

      let productText = ''

      if (ctx.session.payment?.product === 'volunteer') {
        productText = '👥 Добавление волонтёра'
      } else {
        productText = '📦 Контент для экранов'
      }

      const isVolunteer = ctx.session.payment?.product === 'volunteer'

      const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'не указано'
      const adminText = `

💰 *НОВАЯ ОПЛАТА*

${productText}

👤 ${profile.fio || 'не указано'}

😎 ЮзерНейм: ${usernameText}

🆔 ID: ${userId}


💳 Способ оплаты: ${methodText}
${volunteerText}

${ctx.session.payment?.product === 'volunteer' ? 'TYPE:VOLUNTEER' : 'TYPE:CONTENT'}

🕒 ${new Date().toLocaleString('ru-RU')}

Проверь и подтверди вручную!
`.trim()

      let threadId: number | undefined
      try {
        const topic = await ctx.api.createForumTopic(ADMIN_GROUP_ID, `Новый заказ — ${username}`)
        threadId = topic.message_thread_id
      } catch (err) {
        console.error('Ошибка создания темы:', err)
      }

      try {
        const kb = new InlineKeyboard()
          .text('✅ Принять', packCb({ a: 'accept' }))
          .text('❌ Отклонить', packCb({ a: 'reject' }))
          .row()
          .url('Написать юзеру', `tg://user?id=${userId}`)
        if (ctx.message.photo) {
          const photo = ctx.message.photo.at(-1)!
          await ctx.api.sendPhoto(ADMIN_GROUP_ID, photo.file_id, {
            caption: adminText,
            parse_mode: 'Markdown',
            message_thread_id: threadId,
            reply_markup: kb,
          })
        } else if (ctx.message.document) {
          await ctx.api.sendDocument(ADMIN_GROUP_ID, ctx.message.document.file_id, {
            caption: adminText,
            parse_mode: 'Markdown',
            message_thread_id: threadId,
            reply_markup: kb,
          })
        }

        await ctx.reply(
          '✅ Чек успешно отправлен администратору!\nОжидай подтверждения \nЧтобы вернуться в главное меню - нажми /main',
          {
            parse_mode: 'Markdown',
          }
        )
      } catch (err) {
        console.error('Ошибка отправки чека:', err)
        await ctx.reply('❌ Не удалось отправить чек.')
      }
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

    await ctx.reply(
      `✅ Волонтёр выбран: ${shared.users[0].first_name || 'Без имени'}\n\nПереходим к оплате...`
    )

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
