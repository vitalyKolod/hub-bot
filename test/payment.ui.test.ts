import assert from 'node:assert/strict'
import test from 'node:test'
import { PRODUCTS } from '../src/config/products.js'
import { PaymentModel } from '../src/models/Payment.js'
import { fullAdminPaymentKeyboard, paymentCard } from '../src/handlers/payment.handlers.js'

const ids: Record<string, string> = {
  cmg: '5310127020213043624', procontent: '5251299351375937406',
  sunday_screens: '5291749654017381020', storyloops: '5190877553887323413',
  cgs: '5190419001703963847', yandex_360: '5310051278464778081',
  propresenter: '5251272469175631339', add_member: '5258362837411045098',
}
for (const [productId, id] of Object.entries(ids)) {
  test(`${productId} has payment custom emoji`, () => {
    assert.equal(PRODUCTS[productId]?.customEmojiId, id)
    const line = paymentCard({ operation: 'Новая подписка', productIds: [productId], owner: 'Owner', username: '@user', userId: 10, team: 'Team', teamId: 'team', method: 'СБП', time: 'now' })
    assert.ok(line.entities.some((entity: any) => entity.type === 'custom_emoji' && entity.custom_emoji_id === id))
    assert.doesNotMatch(line.text, /PRODUCT_ID|PAYMENT_ID|Тип операции/)
  })
}

test('legacy product keeps a readable title', () => {
  assert.match(paymentCard({ operation: 'Продление', productIds: ['legacy'], owner: 'Owner', username: 'не указано', userId: 10, team: 'Team', teamId: 'team', method: 'СБП', time: 'now' }).text, /• legacy/)
})

for (const status of ['pending', 'accepted', 'rejected'] as const) {
  test(`${status} keyboard preserves communication and profile`, async (t) => {
    const payment = { id: '507f1f77bcf86cd799439011', userId: 10, teamId: 'team', productId: 'storyloops', status }
    const buttons = (await fullAdminPaymentKeyboard(payment)).inline_keyboard.flat()
    assert.ok(buttons.some((b: any) => b.text === '💬 Написать пользователю'))
    assert.ok(buttons.some((b: any) => b.text === '👤 Открыть Telegram-профиль'))
    if (status === 'pending') {
      assert.ok(buttons.some((b: any) => b.text === '✅ Подтвердить'))
      assert.ok(buttons.some((b: any) => b.text === '❌ Отклонить'))
    } else if (status === 'accepted') {
      assert.ok(buttons.some((b: any) => b.text === '✅ Принято'))
      assert.ok(!buttons.some((b: any) => b.text === '❌ Отклонить'))
    } else assert.ok(buttons.some((b: any) => b.text.startsWith('↩️ Вернуть')))
  })
}
