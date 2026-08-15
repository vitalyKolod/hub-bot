import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getOrCreateCart, getPendingItems, getCartTotal } from '../services/cart.service.js'
import { getProduct } from '../config/products.js'
import { getTeamById } from '../services/team.service.js'
import type { ScreenView } from '../core/render.js'

export async function cartScreen(userId: number, teamId: string): Promise<ScreenView> {
  const team = await getTeamById(teamId)

  const cart = await getOrCreateCart(teamId)
  const items = getPendingItems(cart)
  const total = getCartTotal(cart)

  const kb = new InlineKeyboard()

  for (const item of items) {
    const product = getProduct(item.product)
    kb.text(
      `❌ ${product?.name || item.product}`,
      packCb({ a: 'remove_from_cart', p: item._id.toString() }) // только itemId
    ).row()
  }

  if (items.length > 0) {
    kb.text('💳 ОФОРМИТЬ ЗАКАЗ', packCb({ a: 'checkout_cart', p: teamId })).row()
  }

  kb.text('➕ В каталог', packCb({ a: 'open', s: 'add_subscription', p: teamId })).row()
  kb.text('◀️ Назад', packCb({ a: 'back' })).text('🏠 Главная', packCb({ a: 'home' }))

  const lines =
    items.length === 0
      ? ['*🛒 КОРЗИНА*', '', 'Корзина пуста.']
      : [
          '*🛒 КОРЗИНА*',
          '',
          ...items.map((i: any) => `• ${getProduct(i.product)?.name || i.product}`),
          '',
          `*Итого: ${total} ₽*`,
        ]

  return {
    photo: './public/cart.png',
    caption: lines.join('\n'),
    keyboard: kb,
  }
}
