import { CartModel } from '../models/Cart.js'
import { Currency, getProduct, getProductPrice } from '../config/products.js'

export async function getOrCreateCart(teamId: string) {
  let cart = await CartModel.findOne({ teamId })
  if (!cart) {
    cart = await CartModel.create({ teamId, items: [] })
  }
  return cart
}

export async function addToCart(teamId: string, productId: string) {
  const product = getProduct(productId)
  if (!product || !product.cartable) {
    throw new Error(`Product "${productId}" is not cartable`)
  }
  const cart = await getOrCreateCart(teamId)
  cart.items.push({ product: productId, status: 'pending' } as any)
  await cart.save()
  return cart
}

export async function removeFromCart(teamId: string, itemId: string) {
  const cart = await getOrCreateCart(teamId)
  cart.items = cart.items.filter((i: any) => i._id.toString() !== itemId) as any
  await cart.save()
  return cart
}

export function getPendingItems(cart: any) {
  return cart.items.filter((i: any) => i.status === 'pending')
}

export function getCartTotal(cart: any, currency: Currency = 'rub'): number {
  const items = getPendingItems(cart)

  return items.reduce((total, item) => {
    const product = getProduct(item.product)

    if (!product) {
      return total
    }

    const price = getProductPrice(product, currency)

    return total + (price ?? 0)
  }, 0)
}

export async function markCartInReview(teamId: string) {
  const cart = await getOrCreateCart(teamId)
  for (const item of cart.items) {
    if (item.status === 'pending') item.status = 'in_review'
  }
  await cart.save()
  return cart
}

export async function findCartItem(teamId: string, itemId: string) {
  const cart = await getOrCreateCart(teamId)
  const item = cart.items.find((i: any) => i._id.toString() === itemId)
  return { cart, item }
}

export async function setCartItemStatus(
  teamId: string,
  itemId: string,
  status: 'active' | 'rejected'
) {
  const { cart, item } = await findCartItem(teamId, itemId)
  if (!item) return null
  ;(item as any).status = status
  await cart.save()
  return item
}

export async function findCartItemByItemId(itemId: string) {
  const cart = await CartModel.findOne({ 'items._id': itemId })
  if (!cart) return { cart: null, item: null }
  const item = cart.items.find((i: any) => i._id.toString() === itemId)
  return { cart, item }
}

export async function removeFromCartByItemId(itemId: string) {
  const { cart } = await findCartItemByItemId(itemId)
  if (!cart) return null
  cart.items = cart.items.filter((i: any) => i._id.toString() !== itemId) as any
  await cart.save()
  return cart
}
