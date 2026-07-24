import { subscribeKeyboard } from './keyboard.js'
import { subscribeText } from './screen.js'
import {
  ONBOARDING_ASSET,
  getOnboardingCaption,
  getOnboardingKeyboard,
} from '../../ui/onboarding.js'

const CHANNEL_ID = Number(process.env.SUBSCRIBE_CHANNEL_ID) // числовой id канала, см. пункт 3

export async function showSubscribeScreen(ctx: any) {
  // редактируем ТЕКУЩЕЕ сообщение (то самое welcome-фото), а не шлём новое
  await ctx.editMessageCaption({
    caption: subscribeText(),
    parse_mode: 'Markdown',
    reply_markup: subscribeKeyboard(),
  })
}

export async function handleSubscribeCheck(ctx: any) {
  const userId = ctx.from.id

  try {
    const member = await ctx.api.getChatMember(CHANNEL_ID, userId)
    const isSubscribed = ['creator', 'administrator', 'member'].includes(member.status)

    if (!isSubscribed) {
      await ctx.answerCallbackQuery({
        text: '❌ Вы ещё не подписались на группу',
        show_alert: true,
      })
      return
    }
  } catch (err) {
    console.error('Ошибка проверки подписки:', err)
    await ctx.answerCallbackQuery({
      text: '⚠️ Не удалось проверить подписку. Попробуйте позже',
      show_alert: true,
    })
    return
  }

  await ctx.answerCallbackQuery({ text: '✅ Подписка подтверждена' })

  // переход на первую страницу онбординга — тоже редактируем то же сообщение
  await ctx.editMessageMedia({
    type: 'photo',
    media: ONBOARDING_ASSET,
    caption: getOnboardingCaption(0),
    parse_mode: 'Markdown',
  })
  await ctx.editMessageReplyMarkup({
    reply_markup: getOnboardingKeyboard(0),
  })
}
