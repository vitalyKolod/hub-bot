// src/core/cartButton.ts

import type { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getOrCreateCart, getPendingItems } from '../services/cart.service.js'

export async function addCartControls(
  kb: InlineKeyboard,
  teamId: string,
  productId: string
): Promise<InlineKeyboard> {
  const cart = await getOrCreateCart(teamId)
  const count = getPendingItems(cart).length

  kb.text('🛒 В КОРЗИНУ', packCb({ a: 'add_to_cart', p: `${productId}:${teamId}` })).row()

  const cartLabel = count > 0 ? `🛒 ПЕРЕЙТИ В КОРЗИНУ (${count})` : '🛒 ПЕРЕЙТИ В КОРЗИНУ'

  kb.text(cartLabel, packCb({ a: 'open', s: 'cart', p: teamId })).row()

  return kb
}

/**
 * Только счётчик — если нужно показать бейдж где-то ещё
 * (например в главном меню рядом с кнопкой "Корзина"), без строк "В корзину".
 */
export async function getCartCount(teamId: string): Promise<number> {
  const cart = await getOrCreateCart(teamId)
  return getPendingItems(cart).length
}

export async function getCartButtonLabel(teamId: string): Promise<string> {
  const count = await getCartCount(teamId)
  return count > 0 ? `🛒 Корзина (${count})` : '🛒 Корзина'
}
