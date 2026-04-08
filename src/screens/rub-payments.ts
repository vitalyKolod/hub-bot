// src/screens/rub_payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function rubPaymentScreen(userId: number, params: any, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('На карту', packCb({ a: 'rub_method', m: 'card' }))
    .icon('5361847652046611502')
    .row()
  kb.text('По СБП', packCb({ a: 'rub_method', m: 'sbp' }))
    .icon('5368446439800197476')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'payment' }))
    .text('В каталог', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5312361253610475399')

  return {
    photo: './public/payment.png', // тот же зелёный фон
    caption: `*ОПЛАТА — РУБЛИ*\n\n` + `Выберите способ перевода:\n\n`,

    keyboard: kb,
  }
}
