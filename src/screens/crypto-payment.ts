// src/screens/crypto-payments.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js' // ← используем config

import type { ScreenView } from '../core/render.js'

export function cryptoPaymentScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' })).row() // та же кнопка, что и в RUB
  kb.row()
  kb.text('◀️ К способам оплаты', packCb({ a: 'open', s: 'payment' })).text(
    '🏠 На главную',
    packCb({ a: 'home' })
  )

  return {
    photo: './public/payment.png', // тот же зелёный фон, как у RUB
    caption:
      `*ОПЛАТА — КРИПТА (USDT TRC20)*\n\n` +
      `Сеть: **TRC20** (рекомендуется)\n\n` +
      `Адрес кошелька:\n` +
      `\`${config.PAYMENT_USDT}\`\n\n` +
      `Получатель: ${config.PAYMENT_RECEIVER_NAME}\n\n` +
      `После перевода нажмите кнопку **«Я ОПЛАТИЛ(А)»** и пришлите чек (фото или документ).`,

    keyboard: kb,
  }
}
