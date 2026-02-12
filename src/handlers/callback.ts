// src/handlers/callbacks.ts
import { Composer, InlineKeyboard, InputFile } from 'grammy'
import { getScreenData } from '../keyboards.js'
import { clearSession, setSession } from '../state/session.js'
import { extendSubscription } from '../state/users.js'

const composer = new Composer()

composer.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data
  const messageId = ctx.callbackQuery.message?.message_id
  const chatId = ctx.callbackQuery.message?.chat.id

  if (!messageId || !chatId) {
    await ctx.answerCallbackQuery({ text: 'Ошибка, попробуйте снова', show_alert: true })
    return
  }

  let screen:
    | 'main'
    | 'payment_method'
    | 'pay_card'
    | 'pay_crypto'
    | 'contact_admin'
    | 'support'
    | 'faq' = 'main'

  let handled = false

  switch (data) {
    case 'payment_method':
      screen = 'payment_method'
      break

    case 'pay_card':
      screen = 'pay_card'
      break

    case 'pay_crypto':
      screen = 'pay_crypto'
      break

    case 'contact_admin':
      screen = 'contact_admin'
      break

    case 'support':
      screen = 'support'
      break

    case 'faq':
      screen = 'faq'
      break

    case 'back_to_main':
      screen = 'main'
      break

    case 'uploaded_check':
      setSession(chatId, 'waiting_check', { fromPayment: true })

      const waitCaption = `
Пришли скриншот чека, TXID или подтверждение перевода.

Я сразу перешлю админу на проверку.
Чтобы отменить — напиши /cancel
      `.trim()

      const waitKeyboard = new InlineKeyboard().text('Отмена', 'cancel_check')

      try {
        await ctx.api.editMessageCaption(chatId, messageId, {
          caption: waitCaption,
          parse_mode: 'Markdown',
          reply_markup: waitKeyboard,
        })
        await ctx.answerCallbackQuery({ text: 'Ожидаю чек!' })
        handled = true
      } catch (err) {
        console.error('Ошибка при переходе в режим чека:', err)
        await ctx.answerCallbackQuery({
          text: 'Не удалось перейти в режим оплаты',
          show_alert: true,
        })
      }
      break

    case 'cancel_check':
      clearSession(chatId)
      screen = 'main'
      break

    // === КНОПКИ РЕГИСТРАЦИИ ===
    case 'has_subscription':
      // Ставим режим ожидания ФИО
      setSession(chatId, 'waiting_fio', { registrationMode: 'has_subscription' })

      // Меняем сообщение на запрос ФИО
      const fioCaption = 'Отлично! Введи своё ФИО полностью.'
      const fioKeyboard = new InlineKeyboard().text('Отмена', 'cancel_check')

      try {
        await ctx.api.editMessageCaption(chatId, messageId, {
          caption: fioCaption,
          reply_markup: fioKeyboard,
        })
        await ctx.answerCallbackQuery({ text: 'Жду ФИО' })
        handled = true
      } catch (err) {
        console.error('Ошибка перехода к ФИО:', err)
        await ctx.answerCallbackQuery({ text: 'Ошибка, попробуй /start', show_alert: true })
      }
      break

    case 'want_buy':
      // То же самое, но registrationMode = 'want_buy'
      setSession(chatId, 'waiting_fio', { registrationMode: 'want_buy' })

      const fioCaptionWant = 'Круто! Введи своё ФИО полностью.'
      const fioKeyboardWant = new InlineKeyboard().text('Отмена', 'cancel_check')

      try {
        await ctx.api.editMessageCaption(chatId, messageId, {
          caption: fioCaptionWant,
          reply_markup: fioKeyboardWant,
        })
        await ctx.answerCallbackQuery({ text: 'Жду ФИО' })
        handled = true
      } catch (err) {
        console.error('Ошибка перехода к ФИО (want_buy):', err)
        await ctx.answerCallbackQuery({ text: 'Ошибка, попробуй /start', show_alert: true })
      }
      break

    default:
      screen = 'main'
      await ctx.answerCallbackQuery({ text: 'Неизвестная кнопка', show_alert: true })
      return
  }

  if (handled) return

  // Обычное переключение экрана (для остальных кнопок)
  const { photoPath, caption, keyboard } = getScreenData(screen)

  try {
    await ctx.api.editMessageMedia(
      chatId,
      messageId,
      {
        type: 'photo',
        media: new InputFile(photoPath),
        caption: caption.trim(),
        parse_mode: 'Markdown',
      },
      {
        reply_markup: keyboard,
      }
    )

    await ctx.answerCallbackQuery()
  } catch (err) {
    console.error('Ошибка при смене экрана:', err)
    await ctx.answerCallbackQuery({
      text: 'Не удалось обновить экран, попробуйте ещё раз',
      show_alert: true,
    })
  }
})

export default composer
