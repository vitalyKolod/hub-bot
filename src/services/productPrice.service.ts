import { PRODUCTS } from '../config/products.js'
import { ProductPriceModel } from '../models/ProductPrice.js'

export const RUB_PER_USD = 100

export function validatePriceRub(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(/₽|руб(?:лей|ля|ль)?\.?$/i, '')
  if (!/^\d+$/.test(normalized)) throw new Error('Введите целую сумму в рублях, например 850')
  const amount = Number(normalized)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Цена должна быть положительным целым числом')
  return amount
}

export function priceUsd(priceRub: number): number {
  return priceRub / RUB_PER_USD
}

export function formatPricePair(priceRub: number): string {
  return `${priceRub.toLocaleString('ru-RU')} ₽ — ${priceUsd(priceRub).toLocaleString('ru-RU')} $`
}

function applyPrice(productId: string, rub: number) {
  const product = PRODUCTS[productId]
  if (!product) return
  product.priceRub = rub
  product.priceUsd = priceUsd(rub)
}

export async function refreshProductPrices() {
  const records = await ProductPriceModel.find({}).lean()
  for (const record of records) applyPrice(record.productId, record.priceRub)
}

export async function setProductPrice(productId: string, rub: number) {
  const product = PRODUCTS[productId]
  if (!product || product.priceRub === null || !product.cartable) throw new Error('Цена этой подписки недоступна для редактирования')
  if (!Number.isSafeInteger(rub) || rub <= 0) throw new Error('Некорректная цена')
  await ProductPriceModel.findOneAndUpdate({ productId }, { $set: { priceRub: rub } }, { upsert: true, runValidators: true })
  applyPrice(productId, rub)
}
