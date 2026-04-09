import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import type { ScreenView } from '../core/render.js'

export function rubPaymentScreen(userId: number, params?: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' }))
    .icon('5317013291602553603')
    .row()

  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))
    .text('К способам', packCb({ a: 'open', s: 'payment' }))
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
      photo: './public/payment.png',
      caption: 'Ошибка: данные оплаты не найдены',
      keyboard: new InlineKeyboard().text('Назад', packCb({ a: 'back' })),
    }
  }

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — РУБЛИ*\n\n` +
      `Способ: **${methodText}**\n\n` +
      `Реквизиты:\n\`\`\`\n${details}\n\`\`\`\n\n` +
      `Получатель: ${config.PAYMENT_RECEIVER_NAME}\n\n` +
      `После перевода нажмите "Я ОПЛАТИЛ(А)"`,

    keyboard: kb,
  }
}
