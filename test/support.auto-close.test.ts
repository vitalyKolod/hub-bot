import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPPORT_GROUP_ID ||= '-100000000003'
process.env.ADMIN_GROUP_ID ||= '-100000000001'
process.env.CONTENT_GROUP_ID ||= '-100000000002'
process.env.SUNDAY_SCREENS_GROUP_ID ||= '-100000000004'
process.env.PROP_WAITLIST_THREAD_ID ||= '10'
process.env.PROP_STREAM_VERIFY_THREAD_ID ||= '11'
process.env.SUPPORT_AUTO_CLOSE_HOURS = '1'

const { SupportTicketModel } = await import('../src/models/SupportTicket.js')
const { TeamModel } = await import('../src/models/Team.js')
const { AuditLogModel } = await import('../src/models/AuditLog.js')
const { autoCloseInactiveSupportTickets, SUPPORT_AUTO_CLOSE_HOURS } = await import('../src/services/support.service.js')

test('inactive open support ticket is claimed once and both sides are notified', async (t) => {
  const updates: any[] = []
  t.mock.method(SupportTicketModel as any, 'find', (filter: any) => filter.status === 'closed' ? [] : { select: async () => [{ _id: 'ticket-1' }] })
  t.mock.method(SupportTicketModel as any, 'updateOne', async () => ({}))
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async (filter: any, update: any) => {
    updates.push({ filter, update })
    return { id: 'ticket-1', userId: 42, threadId: 7, cardMessageId: 99 }
  })
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
  const sent: any[] = []
  const api: any = {
    sendMessage: async (...args: any[]) => { sent.push(args) },
    closeForumTopic: async () => true,
    editMessageReplyMarkup: async (_chat: number, messageId: number, options: any) => {
      assert.equal(messageId, 99)
      const labels = options.reply_markup.inline_keyboard.flat().map((button: any) => button.text)
      assert.ok(labels.includes('🔓 Возобновить обращение'))
    },
  }
  assert.equal(SUPPORT_AUTO_CLOSE_HOURS, 1)
  assert.equal(await autoCloseInactiveSupportTickets(api, new Date('2026-01-01T02:00:00Z')), 1)
  assert.equal(updates[0].filter.status, 'open')
  assert.equal(updates[0].update.$set.closeReason, 'inactivity')
  assert.equal(sent.length, 2)
})

test('already claimed ticket sends no repeated notifications', async (t) => {
  t.mock.method(SupportTicketModel as any, 'find', (filter: any) => filter.status === 'closed' ? [] : { select: async () => [{ _id: 'ticket-1' }] })
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => null)
  const api: any = { sendMessage: async () => assert.fail('must not notify'), closeForumTopic: async () => true }
  assert.equal(await autoCloseInactiveSupportTickets(api), 0)
})

test('auto-close reports failed user notification honestly to support topic', async (t) => {
  t.mock.method(SupportTicketModel as any, 'find', (filter: any) => filter.status === 'closed' ? [] : { select: async () => [{ _id: 'ticket-2' }] })
  t.mock.method(SupportTicketModel as any, 'updateOne', async () => ({}))
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => ({ id: 'ticket-2', userId: 42, threadId: 8 }))
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
  const adminMessages: string[] = []
  const api: any = {
    sendMessage: async (chatId: number, text: string) => {
      if (chatId === 42) throw new Error('blocked')
      adminMessages.push(text)
    },
    closeForumTopic: async () => true,
  }
  assert.equal(await autoCloseInactiveSupportTickets(api), 1)
  assert.match(adminMessages[0], /Не удалось доставить уведомление пользователю/)
  assert.doesNotMatch(adminMessages[0], /Пользователь уведомлён/)
})

test('failed card edit is retried on the next auto-close run', async (t) => {
  let pending = false
  let claimed = false
  const ticket = { id: 'ticket-3', userId: 42, threadId: 9, cardMessageId: 100 }
  t.mock.method(SupportTicketModel as any, 'find', (filter: any) =>
    filter.status === 'closed'
      ? (pending ? [ticket] : [])
      : { select: async () => claimed ? [] : [{ _id: 'ticket-3' }] }
  )
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => {
    claimed = true
    pending = true
    return ticket
  })
  t.mock.method(SupportTicketModel as any, 'updateOne', async () => { pending = false })
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
  let edits = 0
  const api: any = {
    editMessageReplyMarkup: async (_chat: number, _message: number, options: any) => {
      edits += 1
      if (edits === 1) throw new Error('ETIMEDOUT')
      const labels = options.reply_markup.inline_keyboard.flat().map((button: any) => button.text)
      assert.ok(labels.includes('🔓 Возобновить обращение'))
    },
    sendMessage: async () => true,
    closeForumTopic: async () => true,
  }
  assert.equal(await autoCloseInactiveSupportTickets(api), 1)
  assert.equal(pending, true)
  assert.equal(await autoCloseInactiveSupportTickets(api), 0)
  assert.equal(edits, 2)
  assert.equal(pending, false)
})
