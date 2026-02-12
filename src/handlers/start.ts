// src/handlers/start.ts
import { Composer, InlineKeyboard } from 'grammy'
import { registerUser, getRemainingDays } from '../state/users.js'
import { getScreenData } from '../keyboards.js'
import { InputFile } from 'grammy'

const composer = new Composer()

composer.command('start', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) {
    return ctx.reply('Не удалось определить ID.')
  }

  const user = registerUser(userId)

  // Если уже зарегистрирован и подписка активна — главное меню
  if (user.name && user.city && user.subscriptionEnd && getRemainingDays(user) > 0) {
    const days = getRemainingDays(user)
    const { photoPath, caption, keyboard } = getScreenData('main', days)

    try {
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
    } catch (err) {
      console.error('Ошибка главного меню:', err)
      await ctx.reply('Что-то пошло не так. Напиши /start позже.')
    }
    return
  }

  // Первый запуск — разветвление по кнопкам
  const caption = `
Привет! Добро пожаловать в ProPresenter Hub.

У тебя уже есть активная подписка на ProPresenter?
  `.trim()

  const keyboard = new InlineKeyboard()
    .text('Да, есть подписка', 'has_subscription')
    .row()
    .text('Нет, хочу купить новую', 'want_buy')

  await ctx.reply(caption, {
    reply_markup: keyboard,
    parse_mode: 'Markdown',
  })
})

export default composer
