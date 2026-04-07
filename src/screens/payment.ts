// src/screens/payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

// Цены по продуктам (можно вынести в отдельный файл потом)
const PRODUCT_PRICES = {
  propresenter: 2000,
  content_screens: 1500,
  other: null, // по договорённости
} as const

export function paymentScreen(userId: number, params: any, ctx: any): ScreenView {
  // Читаем продукт из сессии
  const session = ctx.session
  const product = session?.payment?.product || 'unknown'

  // Название продукта для текста
  const productNames = {
    propresenter: 'ProPresenter',
    content_screens: 'Контент для экранов',
    other: 'ДРУГОЕ',
  }

  const productName = productNames[product] || 'подписка'

  // Цена
  const price = PRODUCT_PRICES[product]
  const priceText = price
    ? `Стоимость: *${price} руб/год*`
    : 'Стоимость: по договорённости с админом'

  const kb = new InlineKeyboard()

  kb.text('РУБЛИ', packCb({ a: 'pay_method', m: 'rub' })).row()
  kb.text('КРИПТА (USDT)', packCb({ a: 'open', s: 'crypto_method' })).row()
  kb.row()
  kb.text(
    'ПОДРОБНОСТИ ОБ ОПЛАТЕ',
    packCb({ a: 'open', s: 'payment_details', p: { page: 1 } })
  ).row()
  kb.row()
  kb.text('Назад', packCb({ a: 'back' })).text('На главную', packCb({ a: 'home' }))

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — ${productName.toUpperCase()}*\n\n` +
      `Вы выбрали: ${productName}\n` +
      `${priceText}\n\n` +
      `Вы можете оплатить:\n` +
      `• Рублёвый перевод\n` +
      `• Криптовалютный перевод в USDT (предпочтительнее)\n\n` +
      `Выберите способ ниже:`,

    keyboard: kb,
  }
}
