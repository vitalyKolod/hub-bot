import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPPORT_GROUP_ID ||= '-100000000003'
process.env.ADMIN_GROUP_ID ||= '-100000000001'
process.env.CONTENT_GROUP_ID ||= '-100000000002'
process.env.SUNDAY_SCREENS_GROUP_ID ||= '-100000000004'
process.env.PROP_WAITLIST_THREAD_ID ||= '10'
process.env.PROP_STREAM_VERIFY_THREAD_ID ||= '11'

const { SupportTicketModel } = await import('../src/models/SupportTicket.js')
const { TeamModel } = await import('../src/models/Team.js')
const { buildSupportTopicKeyboard, closeSupportTicket, reopenSupportTicket } = await import('../src/services/support.service.js')

function buttonTexts(keyboard: any) {
  return keyboard.inline_keyboard.flat().map((button: any) => button.text)
}

test('shared support keyboard keeps navigation buttons and switches close to reopen', () => {
  const common = { ticketId: 'ticket-1', userId: 42, teams: [{ id: 'team-1', name: 'Спасение' }] }
  const opened = buttonTexts(buildSupportTopicKeyboard({ ...common, status: 'open' }))
  const closed = buttonTexts(buildSupportTopicKeyboard({ ...common, status: 'closed' }))
  for (const label of ['👤 Профиль и управление', '👥 Открыть команду «Спасение»', '✉️ Открыть Telegram-профиль']) {
    assert.ok(opened.includes(label))
    assert.ok(closed.includes(label))
  }
  assert.ok(opened.includes('✅ Завершить обращение'))
  assert.ok(closed.includes('🔓 Возобновить обращение'))
})

test('manual close edits the original card keyboard without removing other buttons', async (t) => {
  const ticket: any = { id: 'ticket-1', userId: 42, threadId: 7, cardMessageId: 99 }
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async () => ticket)
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [{ id: 'team-1', name: 'Спасение' }] }))
  let markup: any
  const api: any = {
    editMessageReplyMarkup: async (_chat: number, messageId: number, options: any) => { assert.equal(messageId, 99); markup = options.reply_markup },
    sendMessage: async () => true,
    closeForumTopic: async () => true,
  }
  assert.equal(await closeSupportTicket(api, 'ticket-1', 'admin'), ticket)
  const labels = buttonTexts(markup)
  assert.ok(labels.includes('👤 Профиль и управление'))
  assert.ok(labels.includes('👥 Открыть команду «Спасение»'))
  assert.ok(labels.includes('✉️ Открыть Telegram-профиль'))
  assert.ok(labels.includes('🔓 Возобновить обращение'))
})

test('reopen is atomic, reopens forum topic and switches action back to close', async (t) => {
  const ticket: any = { id: 'ticket-1', userId: 42, threadId: 7, cardMessageId: 99 }
  let filter: any
  t.mock.method(SupportTicketModel as any, 'findOneAndUpdate', async (nextFilter: any) => { filter = nextFilter; return ticket })
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
  let reopened = false
  let markup: any
  const api: any = {
    reopenForumTopic: async () => { reopened = true },
    editMessageReplyMarkup: async (_chat: number, _message: number, options: any) => { markup = options.reply_markup },
    sendMessage: async () => true,
  }
  assert.equal(await reopenSupportTicket(api, 'ticket-1', 9001), ticket)
  assert.deepEqual(filter, { _id: 'ticket-1', status: 'closed' })
  assert.equal(reopened, true)
  assert.ok(buttonTexts(markup).includes('✅ Завершить обращение'))
})
