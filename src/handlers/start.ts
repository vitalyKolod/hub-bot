// src/handlers/start.ts
import { Composer, InputFile } from 'grammy'
import { getScreenData } from '../keyboards.js'
import { registerUser, getRemainingDays } from '../state/users.js'

const composer = new Composer()

// Команда /start — регистрирует юзера и показывает меню с реальными днями
composer.command('start', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.reply('Не удалось определить ваш ID. Попробуйте позже.')
    return
  }

  // Регистрируем или получаем существующего юзера
  const user = registerUser(userId)

  // Получаем реальное количество дней
  const remainingDays = getRemainingDays(user)

  // Получаем данные экрана с реальными днями
  const { photoPath, caption, keyboard } = getScreenData('main', remainingDays)

  try {
    await ctx.replyWithPhoto(new InputFile(photoPath), {
      caption: caption.trim(),
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    })

    // Для отладки: покажи в консоли, что юзер зарегистрирован/обновлён
    console.log(`/start от ${userId} — дней осталось: ${remainingDays}`)
  } catch (err) {
    console.error('Ошибка при отправке /start:', err)
    await ctx.reply('Извини, что-то пошло не так. Попробуй /start позже.')
  }
})

export default composer
