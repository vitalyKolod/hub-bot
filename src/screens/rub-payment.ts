import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import type { ScreenView } from '../core/render.js'
import { PRODUCT_PRICES } from './payment.js'

export function rubPaymentScreen(userId: number, params?: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Я ОТПРАВИЛ(А)', packCb({ a: 'paid' }))
    .icon('5317013291602553603')
    .row()

  kb.row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
    .text('К СПОСОБАМ', packCb({ a: 'open', s: 'payment' }))
    .icon('5332600543963522398')

  let details = ''
  let methodText = ''

  if (params.rubType === 'card') {
    if (params.rubCardType === 'mastercard') {
      details = config.RUB_PAYMENT.card.mastercard
      methodText = 'MasterCard'
    } else {
      const bankNameMap = {
        tbank: 'Т-Банк',
        ozon: 'Озон',
        alfa: 'Альфа-Банк',
      }

      const bankName = bankNameMap[params.rubBank]
      details = config.RUB_PAYMENT.card.mir[bankName]
      methodText = `МИР (${bankName})`
    }
  }

  if (params.rubType === 'sbp') {
    const bankNameMap = {
      tbank: 'Т-Банк',
      ozon: 'Озон',
      alfa: 'Альфа-Банк',
    }

    const bankName = bankNameMap[params.rubBank]
    details = config.RUB_PAYMENT.sbp.phone
    methodText = `СБП (${bankName})`
  }

  if (!params) {
    return {
      photo: './public/methods-rub.jpg',
      caption: 'Ошибка: данные перевода не найдены',
      keyboard: new InlineKeyboard().text('Назад', packCb({ a: 'back' })),
    }
  }

  const product = params?.product || 'default'
  let amount = PRODUCT_PRICES[product]

  return {
    photo: './public/methods-rub.jpg',
    caption:
      `*ДОБРОВОЛЬНОЕ ПОЖЕРТВОВАНИЕ — РУБЛИ*\n\n` +
      `Способ: **${methodText}**\n\n` +
      `Сумма добровольного пожертвования: **${amount}**\n\n` +
      `Реквизиты:\n\`\`\`\n${details}\n\`\`\`\n\n` +
      `Получатель: ${config.PAYMENT_RECEIVER_NAME}\n\n` +
      `После перевода нажмите «Я ОТПРАВИЛ(А)»`,

    keyboard: kb,
  }
}
