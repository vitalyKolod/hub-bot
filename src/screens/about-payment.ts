// src/screens/payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function aboutPaymentScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('ВЫБРАТЬ ПОДПИСКУ', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5310257187786878602')
    .row()

  kb.row()

  kb.text('ПОДРОБНЕЕ', packCb({ a: 'open', s: 'payment_details', p: { page: 1 } }))
    .icon('5215209935188534658')

    .row()

  kb.text('◀️ НАЗАД ', packCb({ a: 'back' }))
  kb.text('НА ГЛАВНУЮ', packCb({ a: 'home' })).icon('5465226866321268133')

  return {
    photo: './public/about-payment.png', // зелёный скрин из твоей папки
    caption:
      `Сделать добровольное пожертвование можно одним из способов:\n\n` +
      `• Рублёвый перевод\n` +
      `• Криптовалютный перевод в USDT (предпочтительнее)\n\n` +
      `Выберите способ ниже:`,

    keyboard: kb,
  }
}
