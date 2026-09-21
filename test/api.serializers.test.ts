import assert from 'node:assert/strict'
import test from 'node:test'
import { serializePayment, serializeSubscription, serializeSupportMessage } from '../src/api/serializers.js'

test('API serializers omit Telegram file IDs and subscription secrets', () => {
  const payment = serializePayment({ _id: 'p1', userId: 1, teamId: 't1', productId: 'procontent', amount: 500, currency: 'rub', paymentMethod: 'card', operation: 'purchase', status: 'pending', receipt: { type: 'photo', telegramFileId: 'secret-file' } })
  const subscription = serializeSubscription('propresenter', { status: 'active', meta: { flowNumber: 3, password: 'secret', chatLink: 'private' } })
  const message = serializeSupportMessage({ _id: 'm1', ticketId: 't1', senderType: 'user', senderId: 1, text: 'x', attachments: [{ type: 'image', telegramFileId: 'secret-file' }] })
  assert.doesNotMatch(JSON.stringify({ payment, subscription, message }), /secret|private/)
})
