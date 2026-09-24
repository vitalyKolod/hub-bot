import assert from 'node:assert/strict'
import test from 'node:test'
import { InlineKeyboard } from 'grammy'

process.env.ADMIN_IDS = '99'
process.env.SUPPORT_GROUP_ID ||= '-100125'

const { ConversationModel } = await import('../src/models/Conversation.js')
const { ConversationMessageModel } = await import('../src/models/ConversationMessage.js')
const { PaymentModel } = await import('../src/models/Payment.js')
const { UserModel } = await import('../src/models/User.js')
const {
  closeConversation,
  appendConversationContactButtons,
  conversationCallback,
  parseConversationCallback,
  openConversation,
  relayActiveConversationMessage,
  reopenConversation,
  resolveActiveConversation,
} = await import('../src/services/conversation.service.js')

test('payment contact keyboard keeps relay and Telegram profile actions', () => {
  for (const [type, contextId] of [
    ['payment', '507f1f77bcf86cd799439029'],
  ] as const) {
    const keyboard = appendConversationContactButtons(new InlineKeyboard(), type, contextId, 10)
    const buttons = keyboard.inline_keyboard.flat()
    assert.ok(buttons.find((button: any) => button.text === '💬 Написать пользователю' && button.callback_data))
    assert.equal(buttons.find((button: any) => button.text === '👤 Открыть Telegram-профиль' && button.url)?.url, 'tg://user?id=10')
  }
})

function conversation(overrides: Record<string, any> = {}) {
  return {
    _id: '507f1f77bcf86cd799439020',
    id: '507f1f77bcf86cd799439020',
    userId: 10,
    type: 'payment',
    contextId: '507f1f77bcf86cd799439011',
    status: 'open',
    userActive: true,
    adminChatId: -100500,
    adminThreadId: 77,
    controlMessageId: 88,
    save: async function () { return this },
    ...overrides,
  } as any
}

test('conversation callbacks are isolated by type/context and stay under Telegram limit', () => {
  const payment = conversationCallback('open', 'payment', '507f1f77bcf86cd799439011')
  const support = conversationCallback('open', 'support', '507f1f77bcf86cd799439012')
  assert.notEqual(payment, support)
  assert.equal(parseConversationCallback(payment)?.value, 'payment')
  assert.equal(parseConversationCallback(support)?.value, 'support')
  assert.ok(payment.length <= 64)
})

test('resolveActiveConversation refuses ambiguous routing', async (t) => {
  const values = [conversation(), conversation({ _id: '507f1f77bcf86cd799439021' })]
  t.mock.method(ConversationModel as any, 'find', (filter: any) => {
    assert.deepEqual(filter, { userId: 10, type: 'payment', userActive: true, status: 'open' })
    return { sort() { return this }, async limit() { return values } }
  })
  assert.equal(await resolveActiveConversation(10), null)
})

test('opening payment creates its own active conversation without touching support', async (t) => {
  const created = conversation({ controlMessageId: null })
  let deactivatedFilter: any
  t.mock.method(PaymentModel as any, 'findById', async () => ({ id: created.contextId, userId: 10 }))
  t.mock.method(ConversationModel as any, 'findOneAndUpdate', async (filter: any) => {
    assert.deepEqual(filter, { type: 'payment', contextId: created.contextId })
    return created
  })
  t.mock.method(ConversationModel as any, 'updateMany', async (filter: any) => { deactivatedFilter = filter; return {} })
  t.mock.method(UserModel as any, 'findOne', async () => ({ fio: 'Пользователь' }))
  const ctx: any = {
    from: { id: 99 }, session: {},
    callbackQuery: { message: { message_id: 50, message_thread_id: 77, chat: { id: -100500 } } },
    api: { sendMessage: async () => ({ message_id: 88 }) },
  }
  const result = await openConversation(ctx, 'payment', created.contextId)
  assert.equal(result.id, created.id)
  assert.equal(ctx.session.activeConversationId, created.id)
  assert.equal(created.userActive, true)
  assert.equal(deactivatedFilter.userId, 10)
  assert.notEqual(created.id, 'support-ticket-id')
})

test('active payment routes user reply only to its admin topic', async (t) => {
  const active = conversation()
  t.mock.method(PaymentModel as any, 'findById', async () => ({ id: active.contextId, userId: 10 }))
  t.mock.method(ConversationModel as any, 'find', () => ({ sort() { return this }, async limit() { return [active] } }))
  t.mock.method(ConversationMessageModel as any, 'findOneAndUpdate', async () => ({}))
  const copies: any[] = []
  const reactions: string[] = []
  const ctx: any = {
    session: {}, from: { id: 10, is_bot: false }, chat: { id: 10, type: 'private' },
    message: { message_id: 5 },
    api: { copyMessage: async (...args: any[]) => { copies.push(args); return { message_id: 6 } } },
    react: async (emoji: string) => reactions.push(emoji), reply: async () => {},
  }
  assert.equal(await relayActiveConversationMessage(ctx), true)
  assert.deepEqual(copies[0], [-100500, 10, 5, { message_thread_id: 77 }])
  assert.deepEqual(reactions, ['👍'])
})

test('closed payment no longer captures user reply and reopen restores it', async (t) => {
  const active = conversation({ status: 'closed', userActive: false })
  let resolved: any[] = []
  t.mock.method(ConversationModel as any, 'find', () => ({ sort() { return this }, async limit() { return resolved } }))
  assert.equal(await resolveActiveConversation(10), null)

  t.mock.method(ConversationModel as any, 'findById', async () => active)
  t.mock.method(ConversationModel as any, 'updateMany', async () => ({}))
  t.mock.method(PaymentModel as any, 'findById', async () => ({ id: active.contextId, userId: 10 }))
  t.mock.method(UserModel as any, 'findOne', async () => ({ fio: 'Пользователь' }))
  const edits: any[] = []
  const ctx: any = {
    from: { id: 99 }, session: {},
    api: { editMessageText: async (...args: any[]) => edits.push(args) },
  }
  const result = await reopenConversation(ctx, active.id)
  assert.equal(result.applied, true)
  assert.equal(active.status, 'open')
  assert.equal(active.userActive, true)
  assert.equal(ctx.session.activeConversationId, active.id)
  resolved = [active]
  assert.equal((await resolveActiveConversation(10))?.id, active.id)
  assert.match(edits[0][2], /РЕЖИМ ОБЩЕНИЯ ВКЛЮЧЁН/)
  assert.equal(edits[0][3].reply_markup.inline_keyboard[0][0].text, '✅ Завершить обращение')
})

test('closing conversation does not mutate payment business status', async (t) => {
  const active = conversation()
  const payment = { id: active.contextId, userId: 10, status: 'rejected' }
  t.mock.method(ConversationModel as any, 'findById', async () => active)
  t.mock.method(PaymentModel as any, 'findById', async () => payment)
  t.mock.method(UserModel as any, 'findOne', async () => ({ fio: 'Пользователь' }))
  let editOptions: any
  const ctx: any = {
    from: { id: 99 }, session: { activeConversationId: active.id },
    api: { editMessageText: async (_chat: number, _message: number, _text: string, options: any) => { editOptions = options } },
  }
  const result = await closeConversation(ctx, active.id)
  assert.equal(result.applied, true)
  assert.equal(active.status, 'closed')
  assert.equal(active.userActive, false)
  assert.equal(payment.status, 'rejected')
  assert.equal(ctx.session.activeConversationId, undefined)
  assert.equal(editOptions.reply_markup.inline_keyboard[0][0].text, '🔓 Возобновить обращение')
})

test('switching admin active id sends one message only to conversation B user', async (t) => {
  const a = conversation({ id: 'a', _id: 'a', userId: 10 })
  const b = conversation({ id: 'b', _id: 'b', userId: 20 })
  t.mock.method(ConversationModel as any, 'findById', async (id: string) => id === 'a' ? a : b)
  t.mock.method(PaymentModel as any, 'findById', async () => ({ id: b.contextId, userId: 20 }))
  t.mock.method(ConversationMessageModel as any, 'findOneAndUpdate', async () => ({}))
  const targets: number[] = []
  const ctx: any = {
    session: { activeConversationId: 'b' }, from: { id: 99, is_bot: false },
    chat: { id: -100500, type: 'supergroup' }, message: { message_id: 9, message_thread_id: 77 },
    api: { copyMessage: async (target: number) => { targets.push(target); return { message_id: 10 } } },
    react: async () => {}, reply: async () => {},
  }
  assert.equal(await relayActiveConversationMessage(ctx), true)
  assert.deepEqual(targets, [20])
})

for (const [type, code] of [
  ['registration', 'r'], ['propresenter_request', 'q'], ['stream_confirmation', 's'],
] as const) {
  test(`${type} cannot open, reopen or relay via a stale admin session`, async (t) => {
    assert.equal(parseConversationCallback(`cv:o:${code}:10`), null)
    await assert.rejects(() => openConversation({ from: { id: 99 } }, type, '10'), /отключено/)
    const legacy = conversation({ type, status: 'closed' })
    t.mock.method(ConversationModel as any, 'findById', async () => legacy)
    const ctx: any = {
      from: { id: 99 }, session: { activeConversationId: legacy.id },
      chat: { id: legacy.adminChatId, type: 'supergroup' },
      message: { message_id: 9, message_thread_id: 77 },
    }
    await assert.rejects(() => reopenConversation(ctx, legacy.id), /Недостаточно прав/)
    legacy.status = 'open'
    assert.equal(await relayActiveConversationMessage(ctx), false)
  })
}

for (const status of ['pending', 'rejected']) {
  test(`${status} payment card retains contact, profile and payment actions`, async (t) => {
    const { handlePaymentRejectBack } = await import('../src/handlers/payment.handlers.js')
    const payment = { id: '507f1f77bcf86cd799439011', userId: 10, teamId: 'team', productId: 'content', status }
    t.mock.method(PaymentModel as any, 'findById', async () => payment)
    let markup: any
    await handlePaymentRejectBack({
      editMessageReplyMarkup: async (options: any) => { markup = options.reply_markup },
      answerCallbackQuery: async () => {},
    } as any, payment.id)
    const buttons = markup.inline_keyboard.flat()
    assert.ok(buttons.some((button: any) => button.callback_data === conversationCallback('open', 'payment', payment.id)))
    assert.ok(buttons.some((button: any) => button.url === 'tg://user?id=10'))
    if (status === 'pending') {
      assert.ok(buttons.some((button: any) => button.text === '✅ Подтвердить'))
      assert.ok(buttons.some((button: any) => button.text === '❌ Отклонить'))
    } else {
      assert.ok(buttons.some((button: any) => button.text.startsWith('↩️ Вернуть')))
    }
  })
}
