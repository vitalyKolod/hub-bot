// src/screens/payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function paymentScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('РУБЛИ', packCb({ a: 'pay_method', m: 'rub' }))

    .row()

  kb.text('КРИПТА (USDT)', packCb({ a: 'pay_method', m: 'crypto' }))

    .row()

  kb.row()

  kb.text('ПОДРОБНОСТИ ОБ ОПЛАТЕ', packCb({ a: 'open', s: 'payment_details', p: { page: 1 } }))

    .row()

  kb.text('Назад', packCb({ a: 'back' }))
  kb.text('На главную', packCb({ a: 'home' }))

  return {
    photo: './public/payment.png', // зелёный скрин из твоей папки
    caption:
      `*ОПЛАТА*\n\n` +
      `Вы можете совершить оплату вашей подписки или подписки любого другого продукта ХАБа несколькими способами:\n\n` +
      `• Рублёвый перевод\n` +
      `• Криптовалютный перевод в USDT (предпочтительнее)\n\n` +
      `Выберите способ ниже:`,

    keyboard: kb,
  }
}
