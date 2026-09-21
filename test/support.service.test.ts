import assert from 'node:assert/strict'
import test from 'node:test'
import { SupportTicketModel } from '../src/models/SupportTicket.js'
import { SupportMessageModel } from '../src/models/SupportMessage.js'
import { getSupportTicketWithMessages } from '../src/services/support.service.js'

test('support lookup applies user ownership and returns its messages', async (t) => {
  let filter: any
  t.mock.method(SupportTicketModel as any, 'findOne', async (value: any) => {
    filter = value
    return { _id: 'ticket-1', userId: 42 }
  })
  t.mock.method(SupportMessageModel as any, 'find', () => ({ sort: async () => [{ text: 'hello' }] }))
  const result = await getSupportTicketWithMessages('507f1f77bcf86cd799439011', 42)
  assert.equal(filter.userId, 42)
  assert.equal(result?.messages[0].text, 'hello')
})

test('admin support lookup deliberately omits owner restriction', async (t) => {
  let filter: any
  t.mock.method(SupportTicketModel as any, 'findOne', async (value: any) => { filter = value; return null })
  await getSupportTicketWithMessages('507f1f77bcf86cd799439011')
  assert.equal('userId' in filter, false)
})
