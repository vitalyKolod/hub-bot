// src/screens/rub_payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function rubPaymentScreen(userId: number, params: any, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('На карту', packCb({ a: 'rub_method', m: 'card' })).row()
  kb.text('По СБП', packCb({ a: 'rub_method', m: 'sbp' })).row()
  kb.row()
  kb.text('Назад', packCb({ a: 'open', s: 'payment' })).text('На главную', packCb({ a: 'home' }))

  return {
    photo: './public/payment.png', // тот же зелёный фон
    caption: `*ОПЛАТА — РУБЛИ*\n\n` + `Выберите способ перевода:\n\n` + `• На карту\n` + `• По СБП`,

    keyboard: kb,
  }
}
