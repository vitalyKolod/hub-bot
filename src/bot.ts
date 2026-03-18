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
import { getProfile } from './state/profile.js'
import { startRegistration, handleRegistrationText } from './flows/registration.js'

type PaymentSession = {
  payment: null | {
    product: string
    method: string | null // 'rub' или 'crypto'
    rubMethod?: string | null // 'card' или 'sbp' — если рубли
  }
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

    console.log('callback data:', data) // ← для отладки, можно потом убрать

    // 🔹 Онбординг
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

    // 🔹 Универсальный router
    const parsed = parseCb(data)
    if (!parsed) {
      await ack()
      return
    }

    console.log('parsed:', parsed) // ← для отладки

    // 1. Открытие экранов
    if (parsed.a === 'open' && parsed.s) {
      goTo(userId, parsed.s)
      await renderScreen(ctx, userId, parsed.s, parsed.p)
      await ack()
      return
    }

    // 2. Назад
    if (parsed.a === 'back') {
      const prev = goBack(userId)
      await renderScreen(ctx, userId, prev)
      await ack()
      return
    }

    // 3. На главную
    if (parsed.a === 'home') {
      goHome(userId)
      await renderScreen(ctx, userId, 'main')
      await ack()
      return
    }

    // 4. Выбор продукта → оплата
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

    // 5. Выбор способа оплаты: РУБЛИ / КРИПТА
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
        // Пока заглушка для крипты
        await ctx.answerCallbackQuery({ text: 'Крипта пока в разработке' })
        await ack()
        return
      }
    }

    // 6. Выбор конкретного способа рублями (карта / СБП)
    if (parsed.a === 'rub_method' && parsed.m) {
      ctx.session.payment = {
        ...ctx.session.payment,
        rubMethod: parsed.m,
      }

      let caption = `*ОПЛАТА — РУБЛИ \\(${parsed.m === 'card' ? 'На карту' : 'По СБП'}\\)*\n\n`

      if (parsed.m === 'card') {
        caption += `Номер карты:\n` + `\`2200 1234 5678 9012\`\n` + `Получатель: Виталий К\\.\n\n`
      } else if (parsed.m === 'sbp') {
        caption +=
          `Номер телефона для СБП:\n` + `\`+79990000000\`\n` + `Получатель: Виталий К\\.\n\n`
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

    await ack()
  })

  // 🔹 Регистрация: ответы текстом
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    const profile = getProfile(userId)
    if (profile.reg === 'in_progress') {
      await handleRegistrationText(ctx, userId, ctx.message.text)
    }
  })
}
