// src/screens/payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function aboutPaymentScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Приобрести подписку ', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5310257187786878602')
    .row()

  kb.row()

  kb.text('Подробнее об оплате ', packCb({ a: 'open', s: 'payment_details', p: { page: 1 } }))
    .icon('5215209935188534658')

    .row()

  kb.text('◀️ Назад ', packCb({ a: 'back' }))
  kb.text('На Главную', packCb({ a: 'home' })).icon('5465226866321268133')

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
