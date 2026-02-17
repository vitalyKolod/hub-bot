import { Bot, InlineKeyboard, InputFile } from 'grammy'
import {
  ONBOARDING_ASSET,
  getOnboardingCaption,
  getOnboardingKeyboard,
  isOnboardingCallback,
  parseOnboardingCallback,
} from './ui/onboarding.js'

import { initScreens } from './screens/index.js'
import { renderScreen } from './core/render.js'
import { parseCb } from './core/callback.js'
import { goTo, goBack, goHome } from './state/ui.js'

export function registerHandlers(bot: Bot) {
  initScreens()

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

    // Онбординг остаётся отдельно
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
        await ctx.editMessageReplyMarkup({
          reply_markup: getOnboardingKeyboard(0),
        })
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
        await ctx.editMessageReplyMarkup({
          reply_markup: getOnboardingKeyboard(parsed.step),
        })
        await ack()
        return
      }

      if (parsed.type === 'confirm') {
        goHome(userId)
        await renderScreen(ctx, userId, 'main')
        await ack()
        return
      }
    }

    // Новый универсальный callback router
    const parsed = parseCb(data)
    if (!parsed) {
      await ack()
      return
    }

    if (parsed.a === 'open' && parsed.s) {
      goTo(userId, parsed.s)
      await renderScreen(ctx, userId, parsed.s)
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

    await ack()
  })
}
