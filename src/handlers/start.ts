// src/handlers/start.ts
import { Composer, InlineKeyboard } from 'grammy'
import { registerUser, getRemainingDays } from '../state/users.js'
import { setSession } from '../state/session.js'
import { getScreenData } from '../keyboards.js'
import { InputFile } from 'grammy'

const composer = new Composer()

composer.command('start', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) {
    return ctx.reply('Не удалось определить твой ID. Попробуй позже.')
  }

  const user = registerUser(userId)

  // Если юзер уже зарегистрирован (имя есть) и подписка активна
  if (user.name && user.subscriptionEnd && getRemainingDays(user) > 0) {
    const days = getRemainingDays(user)
    const { photoPath, caption, keyboard } = getScreenData('main', days)

    try {
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
    } catch (err) {
      console.error('Ошибка отправки главного меню:', err)
      await ctx.reply('Что-то пошло не так. Попробуй /start позже.')
    }
    return
  }

  // Первый запуск — сразу показываем выбор по кнопкам
  const caption = `
Привет! Добро пожаловать в ProPresenter Hub.

Это твой первый запуск бота.

У тебя уже есть активная подписка на ProPresenter?
  `.trim()

  const keyboard = new InlineKeyboard()
    .text('Да, подписка уже есть', 'has_subscription')
    .row()
    .text('Нет, хочу купить новую', 'want_buy')

  await ctx.reply(caption, {
    reply_markup: keyboard,
    parse_mode: 'Markdown',
  })
})

export default composer
