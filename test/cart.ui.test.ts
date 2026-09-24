import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CartModel } from '../src/models/Cart.js'
import { addToCart, getCartItemCount, getCartTotal, removeFromCart } from '../src/services/cart.service.js'
import { cartNavigationLabel } from '../src/utils/cartButton.js'
import { contentMenuScreen } from '../src/screens/content-menu.js'
import { cartScreen } from '../src/screens/cart.js'
import { buildProductPurchaseKeyboard } from '../src/screens/product-purchase.js'
import { TeamModel } from '../src/models/Team.js'

function buttons(keyboard: any): string[] {
  return keyboard.inline_keyboard.flat().map((button: any) => button.text)
}

test('cart keeps distinct pending products and count follows removal', async () => {
  const cart: any = { teamId: 'team', items: [], save: async () => cart }
  const originalFindOne = CartModel.findOne
  const originalUpdateOne = CartModel.updateOne
  CartModel.findOne = (async () => cart) as any
  CartModel.updateOne = (async (_filter: any, update: any) => {
    const item = update.$push.items
    if (cart.items.some((existing: any) => existing.product === item.product && existing.status === 'pending')) return { modifiedCount: 0 }
    const id = String(cart.items.length + 1)
    cart.items.push({ ...item, _id: { toString: () => id } })
    return { modifiedCount: 1 }
  }) as any
  try {
    assert.equal(await addToCart('team', 'storyloops'), true)
    assert.equal(await addToCart('team', 'storyloops'), false)
    assert.equal(getCartItemCount(cart), 1)
    assert.equal(cartNavigationLabel(getCartItemCount(cart)), '🛒 Перейти в корзину · 1')
    await addToCart('team', 'cmg')
    await addToCart('team', 'procontent')
    assert.equal(getCartItemCount(cart), 3)
    assert.equal(getCartTotal(cart), 1725)
    await removeFromCart('team', '1')
    assert.equal(getCartItemCount(cart), 2)
    assert.equal(await addToCart('team', 'storyloops'), true)
    assert.equal(getCartItemCount(cart), 3)
  } finally {
    CartModel.findOne = originalFindOne
    CartModel.updateOne = originalUpdateOne
  }
})

test('product and catalog keep cart navigation; cart uses product icon and safe fallback', async () => {
  const cart: any = { teamId: 'team', items: [{ product: 'procontent', status: 'pending', _id: '1' }, { product: 'legacy', status: 'pending', _id: '2' }] }
  const originalFindOne = CartModel.findOne
  const originalTeamFindById = TeamModel.findById
  CartModel.findOne = (async () => cart) as any
  TeamModel.findById = (async () => null) as any
  try {
    const product = await buildProductPurchaseKeyboard('team', 'procontent')
    assert.ok(buttons(product).includes('✅ Уже в корзине'))
    assert.ok(buttons(product).includes('🛒 Перейти в корзину · 2'))
    assert.ok(!buttons(product).includes('🛒 В корзину'))
    const available = await buildProductPurchaseKeyboard('team', 'cmg')
    assert.ok(buttons(available).includes('🛒 В корзину'))
    assert.ok(buttons(available).includes('🛒 Перейти в корзину · 2'))
    const menu = await contentMenuScreen(1, 'team')
    assert.deepEqual(buttons(menu.keyboard).slice(-2), ['🛒 Перейти в корзину · 2', '◀️ НАЗАД'])
    const screen = await cartScreen(1, 'team')
    assert.ok(screen.caption_entities?.some((entity: any) => entity.type === 'custom_emoji' && entity.custom_emoji_id === '5251299351375937406'))
    assert.ok(screen.caption.includes('legacy'))
    assert.ok(!screen.caption.includes('*'))
  } finally {
    CartModel.findOne = originalFindOne
    TeamModel.findById = originalTeamFindById
  }
})

test('empty cart shows add actions and paid subscription takes priority over cart', async () => {
  const cart: any = { teamId: 'team', items: [] }
  const originalFindOne = CartModel.findOne
  const originalTeamFindById = TeamModel.findById
  CartModel.findOne = (async () => cart) as any
  TeamModel.findById = (async () => null) as any
  try {
    const available = await buildProductPurchaseKeyboard('team', 'cmg')
    assert.ok(buttons(available).includes('🛒 В корзину'))
    assert.ok(buttons(available).includes('🛒 Перейти в корзину'))
    const empty = await cartScreen(1, 'team')
    assert.ok(empty.caption.includes('Корзина пока пуста.'))
    assert.ok(buttons(empty.keyboard).includes('➕ В каталог'))
    cart.items.push({ product: 'cmg', status: 'pending', _id: '1' })
    TeamModel.findById = (async () => ({ subscriptions: new Map([['cmg', { status: 'active', expiresAt: new Date(Date.now() + 365 * 86400000) }]]) })) as any
    const paid = await buildProductPurchaseKeyboard('team', 'cmg')
    assert.ok(buttons(paid).includes('✅ Уже оплачено'))
    assert.ok(buttons(paid).includes('🛒 Перейти в корзину · 1'))
    assert.ok(!buttons(paid).includes('🛒 В корзину'))
  } finally {
    CartModel.findOne = originalFindOne
    TeamModel.findById = originalTeamFindById
  }
})
