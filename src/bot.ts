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

if (!ADMIN_GROUP_ID) {
  console.error('ADMIN_GROUP_ID не задан в .env')
  process.exit(1)
}

if (!CONTENT_GROUP_ID) {
  console.error('CONTENT_GROUP_ID не задан в .env')
  process.exit(1)
}

type PaymentSession = {
  payment: null | {
    product: string
    method: string | null
    rubMethod?: string | null
  }
  waitingForReceipt?: boolean
  lastPaymentMessageId?: number
}

type MyContext = Context & SessionFlavor<PaymentSession>

export function registerHandlers(bot: Bot<MyContext>) {
  initScreens()

  bot.use(
    session<PaymentSession, MyContext>({
      initial: () => ({
        payment: null,
      }),
    })
  )

  bot.command('start', async (ctx) => {
    const kb = new InlineKeyboard().text('СТАРТ', 'ui:onb:start')

    await ctx.replyWithPhoto(ONBOARDING_ASSET, {
      caption: 'Привет! Добро пожаловать в ХАБ.\n\nНажми “СТАРТ”, чтобы продолжить 🙂',
      reply_markup: kb,
    })
  })

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

    // Админ-кнопки (Принять / Отклонить)
    if (message && message.message_thread_id) {
      const parsed = parseCb(data)
      if (parsed) {
        console.log('Админ-кнопка:', parsed.a)

        const caption = message.caption || ''

        const userIdMatch = caption.match(/ID:\s*(\d+)/i) || caption.match(/\(ID:\s*(\d+)\)/i)
        if (!userIdMatch) {
          await ctx.answerCallbackQuery({ text: 'ID не найден' })
          return
        }

        const targetUserId = Number(userIdMatch[1])

        if (parsed.a === 'accept') {
          try {
            // Активируем подписку на 1 год
            activateScreensSubscription(targetUserId)

            const invite = await ctx.api.createChatInviteLink(CONTENT_GROUP_ID, {
              member_limit: 1,
              name: `Ссылка для ${targetUserId}`,
              expire_date: Math.floor(Date.now() / 1000) + 1800, // 30 минут
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

            await ctx.answerCallbackQuery({ text: 'Принято ✓ Подписка активирована' })
            return
          } catch (err: any) {
            console.error('Ошибка accept:', err.message || err)
            await ctx.answerCallbackQuery({ text: 'Ошибка при принятии' })
            return
          }
        }

        if (parsed.a === 'reject') {
          try {
            await ctx.api.sendMessage(targetUserId, '❌ Оплата отклонена. Свяжитесь с поддержкой.')

            await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), message.message_id, {
              caption: `${caption}\n\n❌ Отклонено`,
              parse_mode: 'Markdown',
            })

            await ctx.answerCallbackQuery({ text: 'Отклонено ✗' })
            return
          } catch (err: any) {
            console.error('Ошибка reject:', err.message || err)
            await ctx.answerCallbackQuery({ text: 'Ошибка' })
            return
          }
        }
      }
    }

    // Обычная обработка юзерских кнопок
    if (isOnboardingCallback(data)) {
      const parsed = parseOnboardingCallback(data)
      if (!parsed) return

      if (parsed.type === 'start') {
        await ctx.editMessageMedia({
          type: 'photo',
          media: ONBOARDING_ASSET,
          caption: getOnboardingCaption(0),
          parse_mode: 'Markdown',
        })
        await ctx.editMessageReplyMarkup({ reply_markup: getOnboardingKeyboard(0) })
        await ack()
        return
      }

      if (parsed.type === 'page') {
        await ctx.editMessageMedia({
          type: 'photo',
          media: ONBOARDING_ASSET,
          caption: getOnboardingCaption(parsed.step),
          parse_mode: 'Markdown',
        })
        await ctx.editMessageReplyMarkup({ reply_markup: getOnboardingKeyboard(parsed.step) })
        await ack()
        return
      }

      if (parsed.type === 'confirm') {
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
    }

    const parsed = parseCb(data)
    if (!parsed) {
      await ack()
      return
    }

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
      ctx.session.payment = {
        product: parsed.p,
        method: null,
      }

      goTo(userId, 'payment')
      await renderScreen(ctx, userId, 'payment')
      await ack()
      return
    }

    if (parsed.a === 'pay_method' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        method: parsed.m,
      }

      if (parsed.m === 'rub') {
        goTo(userId, 'rub_payment')
        await renderScreen(ctx, userId, 'rub_payment', null, ctx)
        await ack()
        return
      }

      if (parsed.m === 'crypto') {
        goTo(userId, 'crypto_payment') // ← Новый экран
        await renderScreen(ctx, userId, 'crypto_payment')
        await ack()
        return
      }
    }

    if (parsed.a === 'rub_method' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        rubMethod: parsed.m,
      }

      let caption = `*ОПЛАТА — РУБЛИ \\(${parsed.m === 'card' ? 'На карту' : 'По СБП'}\\)*\n\n`

      if (parsed.m === 'card') {
        caption += `Номер карты:\n\`2200 1234 5678 9012\`\nПолучатель: Виталий К\\.\n\n`
      } else if (parsed.m === 'sbp') {
        caption += `Номер телефона для СБП:\n\`+79990000000\`\nПолучатель: Виталий К\\.\n\n`
      }

      caption += `После перевода нажмите "Я ОПЛАТИЛ\\(А\\)" и пришлите чек \\(фото\\).`

      const kb = new InlineKeyboard()
        .text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' }))
        .row()
        .text('Отмена', packCb({ a: 'back' }))

      await ctx.editMessageCaption({
        caption,
        parse_mode: 'Markdown',
        reply_markup: kb,
      })

      await ack()
      return
    }

    if (parsed.a === 'paid') {
      await ctx.answerCallbackQuery({ text: 'Пришли фото чека или документ' })

      await ctx.editMessageCaption({
        caption:
          '📸 Отлично! Теперь пришли фото чека (или документ) в этот чат.\n' +
          'Я сразу передам админу.',
        reply_markup: new InlineKeyboard().text('Отмена', packCb({ a: 'back' })),
        parse_mode: 'Markdown',
      })

      ctx.session.waitingForReceipt = true
      ctx.session.lastPaymentMessageId = ctx.callbackQuery.message.message_id

      await ack()
      return
    }

    await ack()
  })

  // Обработка чека (фото или документ)
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    if (!ctx.session.waitingForReceipt) return

    ctx.session.waitingForReceipt = false

    const userId = ctx.from.id
    const profile = getProfile(userId)

    const username = ctx.from.username ? `@${ctx.from.username}` : `без ника (ID: ${userId})`

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
      const topic = await ctx.api.createForumTopic(
        ADMIN_GROUP_ID,
        `Новый заказ — Контент — ${username} — ${new Date().toLocaleDateString('ru-RU')}`
      )
      threadId = topic.message_thread_id
    } catch (err) {
      console.error('Ошибка создания темы:', err)
      threadId = undefined
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

      const userKb = new InlineKeyboard().text('В главное меню', packCb({ a: 'home' }))

      await ctx.reply('✅ Чек успешно отправлен администратору!\nОжидай подтверждения', {
        reply_markup: userKb,
      })
    } catch (err) {
      console.error('Ошибка отправки чека:', err)
      await ctx.reply('❌ Не удалось отправить чек.')
    }
  })

  // Регистрация текстом
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const profile = getProfile(userId)
    if (profile.reg === 'in_progress') {
      await handleRegistrationText(ctx, userId, ctx.message.text)
    }
  })
}
