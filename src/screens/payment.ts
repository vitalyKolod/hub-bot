// src/screens/payment.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

// Цены по продуктам (можно вынести в отдельный файл потом)
const PRODUCT_PRICES = {
  propresenter: 2000,
  content_screens: 1500,
  other: null, // по договорённости
  volunteer: 250,
} as const

export function paymentScreen(userId: number, params: any, ctx: any): ScreenView {
  // Читаем продукт из сессии
  const session = ctx.session
  const product = session?.payment?.product || 'unknown'

  // Название продукта для текста
  const productNames = {
    propresenter: 'ProPresenter',
    content_screens: 'Контент для экранов',
    sunday_screens: 'Sunday Screens',
    other: 'ДРУГОЕ',
    volunteer: 'Добавление волонтёра',
  }

  const productName = productNames[product] || 'подписка'

  let extraInfo = ''

  if (product === 'volunteer' && ctx.session.payment?.volunteerId) {
    extraInfo = `\n👤 Волонтёр ID: ${ctx.session.payment.volunteerId}`
  }

  // Цена
  const price = PRODUCT_PRICES[product]
  const priceText = price
    ? `Стоимость: *${price} руб/год*`
    : 'Стоимость: по договорённости с админом'

  const kb = new InlineKeyboard()

  kb.text('Рубли', packCb({ a: 'open', s: 'rub_methods' })).icon('5213291343232645210')
  kb.text('Крипта (usdt)', packCb({ a: 'open', s: 'crypto_method' }))
    .icon('5460978422111021593')
    .row()
  kb.row()
  kb.text('Подробности об оплате', packCb({ a: 'open', s: 'payment_details', p: { page: 1 } }))
    .icon('5787544344906959608')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))
    .text('На главную', packCb({ a: 'home' }))
    .icon('5465226866321268133')

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — ${productName.toUpperCase()}*\n\n` +
      `Вы выбрали: ${productName}${extraInfo}\n` +
      `${priceText}\n\n` +
      `Вы можете оплатить:\n` +
      `• Рублёвый перевод\n` +
      `• Криптовалютный перевод в USDT (предпочтительнее)\n\n` +
      `Выберите способ ниже:`,

    keyboard: kb,
  }
}
