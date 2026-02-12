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

  // Режим чека
  if (session?.mode === 'waiting_check') {
    try {
      const user = registerUser(userId)
      const forwarded = await ctx.forwardMessage(config.adminId)

      const confirmKeyboard = new InlineKeyboard()
        .text('✅ Подтвердить оплату', `confirm_${userId}`)
        .row()
        .text('❌ Отклонить', `reject_${userId}`)

      await ctx.api.editMessageReplyMarkup(config.adminId, forwarded.message_id, {
        reply_markup: confirmKeyboard,
      })

      await ctx.reply('Чек отправлен админу! Жди подтверждения.')

      clearSession(userId)
    } catch (err) {
      console.error('Ошибка форварда чека:', err)
      await ctx.reply('Не удалось отправить чек. Попробуй заново или напиши админу.')
    }
    return
  }

  // Шаги регистрации
  if (session?.mode === 'waiting_fio') {
    if (!text) return ctx.reply('ФИО не может быть пустым. Попробуй заново.')

    registerUser(userId, { name: text })
    setSession(userId, 'waiting_city')

    return ctx.reply('Отлично! В каком городе ты живёшь?')
  }

  if (session?.mode === 'waiting_city') {
    if (!text) return ctx.reply('Город не может быть пустым.')

    registerUser(userId, { city: text }) // добавим поле city в User позже

    const currentMode = session.data?.mode // берём из data, что выбрал юзер ранее

    if (currentMode === 'has_subscription') {
      setSession(userId, 'waiting_subscription_date')
      return ctx.reply('До какого числа подписка? (формат: 2026-12-31)')
    } else {
      // want_buy — сразу в оплату
      clearSession(userId)
      const { photoPath, caption, keyboard } = getScreenData('payment_method')
      return ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
    }
  }

  if (session?.mode === 'waiting_subscription_date') {
    const date = new Date(text || '')
    if (isNaN(date.getTime())) return ctx.reply('Неверный формат. Пример: 2026-12-31')

    registerUser(userId, { subscriptionEnd: date })
    clearSession(userId)

    const days = getRemainingDays(registerUser(userId))
    const { photoPath, caption, keyboard } = getScreenData('main', days)

    try {
      await ctx.replyWithPhoto(new InputFile(photoPath), {
        caption: caption.trim(),
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })
      await ctx.reply('Регистрация завершена! Добро пожаловать.')
    } catch (err) {
      console.error('Ошибка меню:', err)
      await ctx.reply('Готово, но меню не загрузилось. Напиши /start.')
    }
    return
  }

  // Если ничего не подходит — просим /start
  await ctx.reply('Напиши /start, чтобы начать или продолжить регистрацию.')
})

export default composer
