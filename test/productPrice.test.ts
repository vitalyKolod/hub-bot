import assert from 'node:assert/strict'
import test from 'node:test'
import { PRODUCTS } from '../src/config/products.js'
import { ProductPriceModel } from '../src/models/ProductPrice.js'
import { getCartTotal } from '../src/services/cart.service.js'
import { formatPricePair, priceUsd, refreshProductPrices, setProductPrice, validatePriceRub } from '../src/services/productPrice.service.js'

test('admin price is entered in rubles and converted at 100 ₽ per dollar', () => {
  assert.equal(validatePriceRub('850 рублей'), 850)
  assert.equal(priceUsd(850), 8.5)
  assert.equal(formatPricePair(850), '850 ₽ — 8,5 $')
  assert.throws(() => validatePriceRub('8,5'), /целую сумму/)
  assert.throws(() => validatePriceRub('0'), /положительным/)
})

test('saved price is used by an existing unpaid cart and restored from the database', async (t) => {
  const oldRub = PRODUCTS.procontent.priceRub
  const oldUsd = PRODUCTS.procontent.priceUsd
  let saved: number | undefined
  t.mock.method(ProductPriceModel as any, 'findOneAndUpdate', async (_filter: any, update: any) => { saved = update.$set.priceRub })
  t.mock.method(ProductPriceModel as any, 'find', () => ({ lean: async () => [{ productId: 'procontent', priceRub: saved }] }))
  try {
    await setProductPrice('procontent', 850)
    assert.equal(saved, 850)
    assert.equal(getCartTotal({ items: [{ product: 'procontent', status: 'pending' }] }), 850)
    assert.equal(getCartTotal({ items: [{ product: 'procontent', status: 'pending' }] }, 'usd'), 8.5)
    PRODUCTS.procontent.priceRub = oldRub
    PRODUCTS.procontent.priceUsd = oldUsd
    await refreshProductPrices()
    assert.equal(PRODUCTS.procontent.priceRub, 850)
    assert.equal(PRODUCTS.procontent.priceUsd, 8.5)
  } finally {
    PRODUCTS.procontent.priceRub = oldRub
    PRODUCTS.procontent.priceUsd = oldUsd
  }
})
