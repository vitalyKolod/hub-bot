// src/handlers/messages.ts
import { Composer, InlineKeyboard } from 'grammy'
import { config } from '../config.js'
import { getSession, clearSession } from '../state/session.js'
import { extendSubscription } from '../state/users.js' // для продления подписки

const composer = new Composer()

// Ловим все сообщения (фото, документ, текст и т.д.)
composer.on('message', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) return

  const session = getSession(userId)

  if (!session || session.mode !== 'waiting_check') {
    // Обычное сообщение — можно игнорировать или ответить "Используй кнопки"
    await ctx.reply('Пожалуйста, используй кнопки в меню или пришли чек, если ты в режиме оплаты.')
    return
  }

  // Юзер в режиме ожидания чека
  try {
    // Форвардим сообщение админу
    const forwarded = await ctx.forwardMessage(config.adminId)

    // Добавляем кнопки подтверждения к форварду
    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Подтвердить оплату', `confirm_${userId}`)
      .row()
      .text('❌ Отклонить', `reject_${userId}`)

    await ctx.api.editMessageReplyMarkup(config.adminId, forwarded.message_id, {
      reply_markup: confirmKeyboard,
    })

    // Пишем юзеру, что чек отправлен
    await ctx.reply('Чек отправлен админу на проверку! Ожидай подтверждения.')

    // Пока оставляем режим (можно очистить после отправки, если хочешь)
    // clearSession(userId)
  } catch (err) {
    console.error('Ошибка при форварде чека:', err)
    await ctx.reply(
      'Не удалось отправить чек админу. Попробуй ещё раз или свяжись с админом напрямую.'
    )
  }
})

export default composer
