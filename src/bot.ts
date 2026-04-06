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
import { activateScreensSubscription, getProfile } from './state/profile.js'
import { startRegistration, handleRegistrationText } from './flows/registration.js'

import dotenv from 'dotenv'
dotenv.config()

const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID)
const CONTENT_GROUP_ID = Number(process.env.CONTENT_GROUP_ID)
const SUPPORT_GROUP_ID = Number(process.env.SUPPORT_GROUP_ID)

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
      rubMethod?: string | null
    }
    waitingForReceipt?: boolean
    inSupportMode?: boolean
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
    const kb = new InlineKeyboard().text('СТАРТ', 'ui:onb:start').success() // зеленая кнопка

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
    await renderScreen(ctx, ctx.from.id, 'main')
  })

  bot.command('profile', async (ctx) => {
    goTo(ctx.from.id, 'profile')
    await renderScreen(ctx, ctx.from.id, 'profile')
  })

  bot.command('support', async (ctx) => {
    ctx.session.inSupportMode = true
    ctx.session.supportThreadId = undefined
    goTo(ctx.from.id, 'support')
    await renderScreen(ctx, ctx.from.id, 'support')
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
            activateScreensSubscription(targetUserId)

            const invite = await ctx.api.createChatInviteLink(CONTENT_GROUP_ID, {
              member_limit: 1,
              name: `Ссылка для ${targetUserId}`,
              expire_date: Math.floor(Date.now() / 1000) + 1800,
            })

            await ctx.api.sendMessage(
              targetUserId,
              `
✅ *Подписка активирована!*

Одноразовая ссылка в группу **"Контент для экранов"** (действует 30 минут):

${invite.invite_link}

Заходи скорее — ссылка сгорит после первого входа.

Теперь твоя подписка отображается в профиле.
            `.trim(),
              { parse_mode: 'Markdown' }
            )

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
        const profile = getProfile(userId)
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

    if (parsed.a === 'end_support') {
      ctx.session.inSupportMode = false
      ctx.session.supportThreadId = undefined
      await ctx.reply('✅ Диалог с поддержкой завершён.\n\nНапиши /main чтобы вернуться в меню.')
      await ack()
      return
    }

    if (ctx.session.inSupportMode) {
      await ctx.answerCallbackQuery({ text: 'Вы в чате поддержки' })
      await ack()
      return
    }

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
      ctx.session.payment = { product: parsed.p, method: null }
      goTo(userId, 'payment')
      await renderScreen(ctx, userId, 'payment')
      await ack()
      return
    }

    if (parsed.a === 'pay_method' && parsed.m) {
      ctx.session.payment = { ...ctx.session.payment, method: parsed.m }

      if (parsed.m === 'rub') {
        goTo(userId, 'rub_payment')
        await renderScreen(ctx, userId, 'rub_payment', null, ctx)
      } else if (parsed.m === 'crypto') {
        goTo(userId, 'crypto_payment')
        await renderScreen(ctx, userId, 'crypto_payment')
      }
      await ack()
      return
    }

    if (parsed.a === 'rub_method' && parsed.m) {
      ctx.session.payment = { ...ctx.session.payment, rubMethod: parsed.m }

      let caption = `*ОПЛАТА — РУБЛИ (${parsed.m === 'card' ? 'На карту' : 'По СБП'})*\n\n`

      if (parsed.m === 'card') {
        caption += `Номер карты:\n\`2200 1234 5678 9012\`\nПолучатель: Виталий К.\n\n`
      } else if (parsed.m === 'sbp') {
        caption += `Номер телефона для СБП:\n\`+79990000000\`\nПолучатель: Виталий К.\n\n`
      }

      caption += `После перевода нажмите "Я ОПЛАТИЛ(А)" и пришлите чек (фото).`

      const kb = new InlineKeyboard()
        .text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' }))
        .row()
        .text('Отмена', packCb({ a: 'back' }))

      await ctx.editMessageCaption({ caption, parse_mode: 'Markdown', reply_markup: kb })
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
  })

  // ====================== СООБЩЕНИЯ ======================
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const profile = getProfile(userId)

    if (profile.reg === 'in_progress') {
      await handleRegistrationText(ctx, userId, ctx.message.text)
      return
    }

    if (ctx.session.inSupportMode) {
      let threadId = ctx.session.supportThreadId
      if (!threadId) {
        const username = ctx.from.username ? `@${ctx.from.username}` : `ID:${userId}`
        const profileData = getProfile(userId)
        const userInfo = `🆘 Новое обращение\n👤 ${profileData.fio || 'не указано'}\nID: ${userId}`

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

  // ====================== ЧЕК (фото / документ) — ВЫСОКИЙ ПРИОРИТЕТ ======================
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    if (ctx.session.waitingForReceipt) {
      ctx.session.waitingForReceipt = false

      const userId = ctx.from.id
      const profile = getProfile(userId)
      const username = ctx.from.username ? `@${ctx.from.username}` : `ID: ${userId}`

      const methodText =
        ctx.session.payment?.method === 'crypto'
          ? 'Крипта (USDT TRC20)'
          : `Рубли (${ctx.session.payment?.rubMethod === 'card' ? 'На карту' : 'По СБП'})`

      const adminText = `
💰 НОВАЯ ОПЛАТА — Контент для экранов

👤 ${profile.fio || 'не указано'}
📍 Город: ${profile.city || 'не указано'}
⛪ Церковь: ${profile.church || 'не указано'}
🔗 ${username}
🆔 ID: ${userId}

Способ: ${methodText}

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

        await ctx.reply('✅ Чек успешно отправлен администратору!\nОжидай подтверждения', {
          reply_markup: new InlineKeyboard().text('🏠 В главное меню', packCb({ a: 'home' })),
        })
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

  console.log('✅ Бот запущен')
}
