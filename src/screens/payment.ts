import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getProduct } from '../config/products.js'
import { getOrCreateCart, getPendingItems, getCartTotal } from '../services/cart.service.js'
import type { ScreenView } from '../core/render.js'

export async function paymentScreen(userId: number, params: any, ctx: any): Promise<ScreenView> {
  const payment = ctx?.session?.payment
  const product = payment?.product || 'unknown'
  const teamId = payment?.teamId
  const isExtension = payment?.isExtension

  let productName = 'подписка'
  let amount: number | null = null

  if (product === 'cart' && teamId) {
    const cart = await getOrCreateCart(teamId)
    const items = getPendingItems(cart)
    productName =
      items.map((i: any) => getProduct(i.product)?.name || i.product).join(', ') || 'корзина'
    amount = getCartTotal(cart)
  } else {
    const productConfig = getProduct(product)
    productName = productConfig?.name || 'подписка'
    amount = productConfig?.price ?? null
  }

  let extensionInfo = ''
  if (isExtension) {
    extensionInfo =
      '\n\n🔄 *Продление подписки*\n' +
      '• К текущему сроку добавится +1 год\n' +
      '• Все оставшиеся дни сохранятся\n'
  }

  const priceText = amount
    ? `Стоимость: *${amount} ₽/год*`
    : 'Стоимость: по договорённости с админом'

  const kb = new InlineKeyboard()

  kb.text('Рубли', packCb({ a: 'open', s: 'rub_methods' })).icon('5213291343232645210')
  kb.text('Крипта (usdt)', packCb({ a: 'open', s: 'crypto_method' }))
    .icon('5460978422111021593')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))
    .text('На главную', packCb({ a: 'home' }))
    .icon('5465226866321268133')

  return {
    photo: './public/payment.png',
    caption:
      `*${isExtension ? 'ПРОДЛЕНИЕ' : 'ОПЛАТА'} — ${productName.toUpperCase()}*\n\n` +
      `${priceText}\n${extensionInfo}\n` +
      `Выберите способ ниже:`,
    keyboard: kb,
  }
}
