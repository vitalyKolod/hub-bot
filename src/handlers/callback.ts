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

  // Сначала проверяем динамические кнопки админа (confirm_, reject_, clarify_)
  if (data.startsWith('confirm_')) {
    const userId = Number(data.slice(8)) // обрезаем 'confirm_'
    if (!isNaN(userId)) {
      extendSubscription(userId, 365)
      await ctx.api.sendMessage(userId, 'Оплата подтверждена! Подписка продлена на год.')
      await ctx.answerCallbackQuery({ text: 'Подтверждено' })
      handled = true
    }
  } else if (data.startsWith('reject_')) {
    const userId = Number(data.slice(7))
    if (!isNaN(userId)) {
      await ctx.api.sendMessage(userId, 'Оплата отклонена. Попробуй ещё раз.')
      await ctx.answerCallbackQuery({ text: 'Отклонено' })
      handled = true
    }
  } else if (data.startsWith('clarify_')) {
    const userId = Number(data.slice(8))
    if (!isNaN(userId)) {
      await ctx.api.sendMessage(
        userId,
        'Админ просит уточнить детали оплаты. Пришли дополнительно.'
      )
      await ctx.answerCallbackQuery({ text: 'Просьба уточнить' })
      handled = true
    }
  }

  if (handled) return // если обработали админ-кнопку — выходим

  // Обычный switch для остальных кнопок
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
        await ctx.api.editMessageMedia(
          chatId,
          messageId,
          {
            type: 'photo',
            media: new InputFile('./public/payment.png'),
            caption: waitCaption,
            parse_mode: 'Markdown',
          },
          {
            reply_markup: waitKeyboard,
          }
        )
        await ctx.answerCallbackQuery({ text: 'Ожидаю чек!' })
        handled = true
      } catch (err) {
        console.error('Ошибка чека:', err)
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

    // Разветвление регистрации
    case 'has_subscription':
      setSession(chatId, 'waiting_fio', { registrationMode: 'has_subscription' })

      const fioHas = 'Отлично! Введи своё ФИО полностью.'
      const fioKb = new InlineKeyboard().text('Отмена', 'cancel_check')

      try {
        await ctx.api.editMessageMedia(
          chatId,
          messageId,
          {
            type: 'photo',
            media: new InputFile('./public/main-menu.png'),
            caption: fioHas,
            parse_mode: 'Markdown',
          },
          {
            reply_markup: fioKb,
          }
        )
        await ctx.answerCallbackQuery({ text: 'Жду ФИО' })
        handled = true
      } catch (err) {
        console.error('Ошибка ФИО (has):', err)
        await ctx.answerCallbackQuery({ text: 'Ошибка, попробуй /start', show_alert: true })
      }
      break

    case 'want_buy':
      setSession(chatId, 'waiting_fio', { registrationMode: 'want_buy' })

      const fioWant = 'Круто! Введи своё ФИО полностью.'
      const fioKbWant = new InlineKeyboard().text('Отмена', 'cancel_check')

      try {
        await ctx.api.editMessageMedia(
          chatId,
          messageId,
          {
            type: 'photo',
            media: new InputFile('./public/payment.png'),
            caption: fioWant,
            parse_mode: 'Markdown',
          },
          {
            reply_markup: fioKbWant,
          }
        )
        await ctx.answerCallbackQuery({ text: 'Жду ФИО' })
        handled = true
      } catch (err) {
        console.error('Ошибка ФИО (want):', err)
        await ctx.answerCallbackQuery({ text: 'Ошибка, попробуй /start', show_alert: true })
      }
      break

    default:
      screen = 'main'
      await ctx.answerCallbackQuery({ text: 'Неизвестная кнопка', show_alert: true })
      return
  }

  if (handled) return

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
    console.error('Ошибка смены экрана:', err)
    await ctx.answerCallbackQuery({ text: 'Не удалось обновить', show_alert: true })
  }
})

export default composer
