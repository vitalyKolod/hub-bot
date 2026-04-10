import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import type { ScreenView } from '../core/render.js'

export function cardMethods(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('МИР', packCb({ a: 'rub_card_type', m: 'mir' }))
    .icon('5461071584246638157')
    .row()
  kb.text('MasterCard', packCb({ a: 'rub_card_type', m: 'mastercard' }))
    .icon('5190642511802022990')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'rub_methods' }))

    .text('К способам', packCb({ a: 'open', s: 'payment' }))
    .icon('5332600543963522398')

  return {
    photo: './public/payment.png',
    caption:
      `*💳 Оплата банковской картой*\n\n` +
      `Пожалуйста, выберите систему карты:\n\n` +
      `MasterCard / МИР\n`,
    keyboard: kb,
  }
}
