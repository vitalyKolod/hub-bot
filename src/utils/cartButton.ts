// src/core/cartButton.ts

import type { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getCartItemCount, getOrCreateCart } from '../services/cart.service.js'

export function cartNavigationLabel(count: number): string {
  return count > 0 ? `🛒 Перейти в корзину · ${count}` : '🛒 Перейти в корзину'
}

export async function addCartControls(
  kb: InlineKeyboard,
  teamId: string,
  productId: string
): Promise<InlineKeyboard> {
  const cart = await getOrCreateCart(teamId)
  const count = getCartItemCount(cart)

  kb.text('🛒 В КОРЗИНУ', packCb({ a: 'add_to_cart', p: `${productId}:${teamId}` })).row()

  const cartLabel = cartNavigationLabel(count)

  kb.text(cartLabel, packCb({ a: 'open', s: 'cart', p: teamId })).row()

  return kb
}

/**
 * Только счётчик — если нужно показать бейдж где-то ещё
 * (например в главном меню рядом с кнопкой "Корзина"), без строк "В корзину".
 */
export async function getCartCount(teamId: string): Promise<number> {
  const cart = await getOrCreateCart(teamId)
  return getCartItemCount(cart)
}

export async function getCartButtonLabel(teamId: string): Promise<string> {
  const count = await getCartCount(teamId)
  return count > 0 ? `🛒 Корзина (${count})` : '🛒 Корзина'
}
