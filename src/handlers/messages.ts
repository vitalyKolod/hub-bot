// src/handlers/messages.ts
import { Composer, InlineKeyboard } from 'grammy'
import { config } from '../config.js'
import { getSession, clearSession, setSession } from '../state/session.js'
import { registerUser, getRemainingDays } from '../state/users.js'
import { getScreenData } from '../keyboards.js'
import { InputFile } from 'grammy'

const composer = new Composer()

composer.on('message', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) return

  const session = getSession(userId)
  const text = ctx.message.text?.trim()

  // Режим чека — только документы
  if (session?.mode === 'waiting_check') {
    if (!ctx.message.document) {
      return ctx.reply('Пришли именно документ (PDF, ZIP и т.д.). Фото или текст не принимаются.')
    }

    try {
      const user = registerUser(userId)

      // Инфа админу
      await ctx.api.sendMessage(
        config.adminId,
        `Новый чек от юзера:
ФИО: ${user.name || 'не указано'}
Город: ${user.city || 'не указан'}
Telegram ID: ${userId}
Подписка до: ${user.subscriptionEnd ? user.subscriptionEnd.toISOString() : 'нет'}`
      )

      await ctx.forwardMessage(config.adminId)

      await ctx.api.sendMessage(config.adminId, 'Выбери действие:', {
        reply_markup: new InlineKeyboard()
          .text('✅ Подтвердить', `confirm_${userId}`)
          .text('❌ Отклонить', `reject_${userId}`)
          .row()
          .text('📝 Уточнить', `clarify_${userId}`),
      })

      await ctx.reply('Чек успешно отправлен админу! Жди подтверждения.')
      clearSession(userId)
    } catch (err) {
      console.error('Ошибка отправки чека:', err)
      await ctx.reply('Не удалось отправить документ админу. Попробуй заново.')
    }
    return
  }

  // Регистрация по шагам
  if (session?.mode === 'waiting_fio') {
    if (!text) return ctx.reply('ФИО не может быть пустым.')

    registerUser(userId, { name: text })
    setSession(userId, 'waiting_city', session.data)

    return ctx.reply('В каком городе ты живёшь?')
  }

  if (session?.mode === 'waiting_city') {
    if (!text) return ctx.reply('Город не может быть пустым.')

    registerUser(userId, { city: text })

    if (session.data?.registrationMode === 'has_subscription') {
      setSession(userId, 'waiting_subscription_date')
      return ctx.reply('До какого числа подписка? (формат: 2026-12-31)')
    } else {
      clearSession(userId)
      const { photoPath, caption, keyboard } = getScreenData('payment_method')
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
      return
    }
  }

  if (session?.mode === 'waiting_subscription_date') {
    const date = new Date(text || '')
    if (isNaN(date.getTime())) return ctx.reply('Неверный формат. Пример: 2026-12-31')

    registerUser(userId, { subscriptionEnd: date })
    clearSession(userId)

    const days = getRemainingDays(registerUser(userId))
    const { photoPath, caption, keyboard } = getScreenData('main', days)

    await ctx.replyWithPhoto(new InputFile(photoPath), {
      caption: caption.trim(),
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    })
    await ctx.reply('Регистрация завершена! Добро пожаловать.')
    return
  }

  // Если юзер уже зарегистрирован — показываем меню
  const user = registerUser(userId)
  if (user.name && user.city) {
    if (user.subscriptionEnd && getRemainingDays(user) > 0) {
      const days = getRemainingDays(user)
      const { photoPath, caption, keyboard } = getScreenData('main', days)
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
      return
    } else {
      // Подписки нет — в оплату
      const { photoPath, caption, keyboard } = getScreenData('payment_method')
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
      return
    }
  }

  // Если ничего — /start
  await ctx.reply('Напиши /start, чтобы начать.')
})

export default composer
