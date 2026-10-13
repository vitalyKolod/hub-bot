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
  t.mock.method(SupportTicketModel as any, 'find', () => ({ select: async () => [{ _id: 'ticket-1' }] }))
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async (filter: any, update: any) => {
    updates.push({ filter, update })
    return { id: 'ticket-1', userId: 42, threadId: 7, cardMessageId: 99 }
  })
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
  const sent: any[] = []
  const edits: any[] = []
  const api: any = {
    sendMessage: async (...args: any[]) => { sent.push(args) },
    closeForumTopic: async () => true,
    editMessageReplyMarkup: async (_chat: number, messageId: number, options: any) => {
      edits.push({ messageId, options })
      assert.equal(messageId, 99)
      const labels = options.reply_markup.inline_keyboard.flat().map((button: any) => button.text)
      assert.ok(labels.includes('🔓 Возобновить обращение'))
      assert.ok(options.reply_markup.inline_keyboard.flat().some((button: any) => button.callback_data === 'support:reopen:ticket-1'))
    },
  }
  assert.equal(SUPPORT_AUTO_CLOSE_HOURS, 1)
  assert.equal(await autoCloseInactiveSupportTickets(api, new Date('2026-01-01T02:00:00Z')), 1)
  assert.equal(updates[0].filter.status, 'open')
  assert.equal(updates[0].update.$set.closeReason, 'inactivity')
  assert.equal(sent.length, 2)
  assert.equal(edits.length, 1)
  assert.equal(sent[1][2].reply_markup, undefined)
})

for (const cardMessageId of [null, 99]) {
  test(`auto-close provides a working reopen button when card ${cardMessageId ? 'editing fails' : 'ID is missing'}`, async (t) => {
    t.mock.method(SupportTicketModel as any, 'find', () => ({ select: async () => [{ _id: 'ticket-1' }] }))
    t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => ({
      id: 'ticket-1', userId: 42, threadId: 7, cardMessageId,
    }))
    t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
    t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
    const sent: any[] = []
    const closedTopics: any[] = []
    const api: any = {
      editMessageReplyMarkup: async () => { throw new Error('message to edit not found') },
      sendMessage: async (...args: any[]) => { sent.push(args) },
      closeForumTopic: async (...args: any[]) => { closedTopics.push(args) },
    }
    assert.equal(await autoCloseInactiveSupportTickets(api), 1)
    assert.equal(sent.length, 2)
    assert.equal(sent[0][0], 42)
    assert.equal(sent[0][2], undefined)
    assert.equal(sent[1][2].message_thread_id, 7)
    assert.deepEqual(sent[1][2].reply_markup.inline_keyboard, [[{
      text: '🔓 Возобновить обращение', callback_data: 'support:reopen:ticket-1',
    }]])
    assert.equal(closedTopics.length, 1)
    assert.equal(closedTopics[0][1], 7)
  })
}

test('already claimed ticket sends no repeated notifications', async (t) => {
  t.mock.method(SupportTicketModel as any, 'find', () => ({ select: async () => [{ _id: 'ticket-1' }] }))
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => null)
  const api: any = { sendMessage: async () => assert.fail('must not notify'), closeForumTopic: async () => true }
  assert.equal(await autoCloseInactiveSupportTickets(api), 0)
})

test('auto-close reports failed user notification honestly to support topic', async (t) => {
  t.mock.method(SupportTicketModel as any, 'find', () => ({ select: async () => [{ _id: 'ticket-2' }] }))
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
