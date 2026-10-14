import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPPORT_GROUP_ID ||= '-100125'
const { startSupportFlow, handleSupportFlowCallback, guardSupportSelection } = await import('../src/handlers/supportFlow.handlers.js')
const { supportContextText } = await import('../src/services/supportContext.js')
const { ConversationModel } = await import('../src/models/Conversation.js')
const { PaymentModel } = await import('../src/models/Payment.js')
const { TeamModel } = await import('../src/models/Team.js')
const { SupportTicketModel } = await import('../src/models/SupportTicket.js')
const { SupportMessageModel } = await import('../src/models/SupportMessage.js')
const { UserModel } = await import('../src/models/User.js')
const { createSupportTicketForUser, sendUserMessageToSupport, relayAdminMessage } = await import('../src/services/support.service.js')
const { relayActiveConversationMessage } = await import('../src/services/conversation.service.js')
const { auditLogService } = await import('../src/services/auditLog.service.js')
const id = '507f1f77bcf86cd799439011'

function context(t: any, teams: any[] = [], payments: any[] = []) {
  const sent: any[] = []
  const edits: any[] = []
  let view: any
  const switches: any[] = []
  t.mock.method(ConversationModel as any, 'updateMany', async (...args: any[]) => { switches.push(args); return {} })
  t.mock.method(TeamModel as any, 'find', () => Object.assign(Promise.resolve(teams), { select: async () => teams }))
  t.mock.method(PaymentModel as any, 'find', (filter: any) => ({ sort: async () => payments.filter(p => p.userId === filter.userId && filter.status.$in.includes(p.status)) }))
  const ctx: any = {
    session: {}, from: { id: 10, username: 'tester' }, chat: { id: 10, type: 'private' },
    callbackQuery: { message: { message_id: 0 } },
    answerCallbackQuery: async () => {},
    api: { editMessageCaption: async (chatId: number, messageId: number, options: any) => { edits.push({ chatId, messageId, text: options.caption, ...options }); view = { text: options.caption, ...options } } },
    replyWithPhoto: async (photo: any, options: any) => { sent.push({ photo, text: options.caption, ...options }); view = { text: options.caption, ...options }; return { message_id: sent.length } },
    reply: async (text: string, options: any) => { sent.push({ text, ...options }); view = { text, ...options }; return { message_id: sent.length } },
  }
  const click = async (data: string) => {
    ctx.callbackQuery.message.message_id = ctx.session.supportDraft?.messageId
    await handleSupportFlowCallback(ctx, data)
  }
  return { ctx, sent, edits, switches, click, last: () => view, draft: () => ctx.session.supportDraft }
}
const payment = { id, userId: 10, productId: 'procontent', amount: 500, currency: 'rub', status: 'rejected', rejectionReason: 'Сумма не совпадает' }

test('support includes Yandex 360 without creating a ticket', async t => {
  const { ctx, last, draft, switches } = context(t)
  t.mock.method(SupportTicketModel as any, 'create', () => assert.fail('ticket created too early'))
  await startSupportFlow(ctx)
  assert.equal(draft().step, 'categories')
  assert.equal(last().reply_markup.inline_keyboard.flat().filter((b: any) => b.callback_data.startsWith('s2:category:')).length, 7)
  assert.match(last().text, /С чем вам нужна помощь/)
  assert.deepEqual(switches, [[{ userId: 10, userActive: true }, { $set: { userActive: false } }]])
})

for (const [category, expected] of [['payment', 'Оплата отклонена'], ['subscription', 'Нет доступа'], ['propresenter', 'Проблема с потоком'], ['hub', 'Бот работает неправильно']]) {
  test(`${category} shows its issues and back returns to categories`, async t => {
    const { ctx, click, last, draft } = context(t)
    await startSupportFlow(ctx)
    await click(`s2:category:${category}`)
    assert.equal(draft().step, 'issues')
    assert.ok(last().reply_markup.inline_keyboard.flat().some((b: any) => b.text.includes(expected)))
    await click('s2:back')
    assert.equal(draft().step, 'categories')
    assert.equal(draft().metadata.category, undefined)
  })
}

test('other goes straight to message and has back and close controls', async t => {
  const { ctx, click, last, draft } = context(t)
  await startSupportFlow(ctx)
  await click('s2:category:other')
  assert.equal(draft().step, 'message')
  assert.equal(ctx.session.inSupportMode, true)
  assert.match(last().text, /ОПИШИТЕ ВОПРОС/)
  assert.ok(last().reply_markup.inline_keyboard.flat().some((b: any) => b.callback_data === 'support:close:user'))
  await click('s2:back')
  assert.equal(draft().step, 'categories')
})

test('payment selection uses owned relevant records; back visits each previous step', async t => {
  const { ctx, click, draft } = context(t, [], [payment, { ...payment, id: '507f1f77bcf86cd799439012' }, { ...payment, userId: 20 }, { ...payment, status: 'accepted' }])
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  await click('s2:issue:payment_rejected')
  assert.equal(draft().step, 'payments')
  assert.equal(draft().options.length, 2)
  await click('s2:pick:0')
  assert.equal(draft().metadata.paymentId, id)
  await click('s2:back')
  assert.equal(draft().step, 'payments')
  assert.equal(draft().metadata.paymentId, undefined)
  await click('s2:back')
  assert.equal(draft().step, 'issues')
  await click('s2:back')
  assert.equal(draft().step, 'categories')
})

test('one payment auto-selects; no payment does not block support', async t => {
  const { ctx, click, draft } = context(t, [], [payment])
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  await click('s2:issue:payment_rejected')
  assert.equal(draft().step, 'message')
  assert.equal(draft().metadata.paymentId, id)
  await click('s2:back')
  assert.equal(draft().step, 'issues')
  await click('s2:issue:payment_pending')
  assert.equal(draft().step, 'message')
  assert.equal(draft().metadata.paymentId, undefined)
})

test('team is selected before issue, stored and back preserves the previous screen', async t => {
  const { ctx, click, draft } = context(t, [{ id, name: 'Спасение' }])
  await startSupportFlow(ctx)
  await click('s2:category:team')
  assert.equal(draft().step, 'teams')
  await click('s2:pick:0')
  assert.equal(draft().step, 'issues')
  await click('s2:issue:no_invite')
  assert.deepEqual(draft().metadata, { source: 'support_menu', category: 'team', subcategory: 'no_invite', teamId: id })
  await click('s2:back')
  assert.equal(draft().step, 'issues')
  await click('s2:back')
  assert.equal(draft().step, 'teams')
})

test('no teams goes directly to issues', async t => {
  const { ctx, click, draft } = context(t)
  await startSupportFlow(ctx)
  await click('s2:category:team')
  assert.equal(draft().step, 'issues')
  await click('s2:issue:join')
  assert.equal(draft().step, 'message')
  assert.equal(draft().metadata.teamId, undefined)
})

test('subscriptions support multi-select, toggling, legacy maps and exact back', async t => {
  const { ctx, click, draft, last } = context(t, [{ subscriptions: new Map([['procontent', { status: 'active' }], ['cmg', { status: 'expired' }]]) }, { subscriptions: { legacy: { status: 'active' }, unused: { status: 'none' } } }])
  await startSupportFlow(ctx)
  await click('s2:category:subscription')
  await click('s2:issue:no_access')
  assert.equal(draft().step, 'subscriptions')
  assert.equal(draft().options.length, 3)
  await click('s2:pick:0')
  await click('s2:pick:1')
  assert.ok(last().reply_markup.inline_keyboard[0][0].text.startsWith('☑'))
  await click('s2:pick:1')
  await click('s2:pick:1')
  await click('s2:continue')
  assert.deepEqual(draft().metadata.productIds, ['procontent', 'cmg'])
  await click('s2:back')
  assert.equal(draft().step, 'subscriptions')
  await click('s2:back')
  assert.equal(draft().step, 'issues')
  assert.equal(draft().metadata.productIds, undefined)
})

test('empty subscriptions and pricing without a product allow asking a question', async t => {
  const { ctx, click, draft } = context(t)
  await startSupportFlow(ctx)
  await click('s2:category:subscription')
  await click('s2:issue:no_access')
  assert.equal(draft().step, 'message')
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  await click('s2:issue:pricing')
  assert.equal(draft().step, 'products')
  assert.ok(draft().options.some((p: any) => p.id === 'procontent'))
  await click('s2:continue')
  assert.equal(draft().step, 'message')
  assert.equal(draft().metadata.productIds, undefined)
})

test('rejection shortcut bypasses all selections and keeps payment open/status untouched', async t => {
  const { ctx, click, draft, sent } = context(t)
  t.mock.method(PaymentModel as any, 'findById', async () => payment)
  const before = structuredClone(payment)
  await click(`s2:reject:${id}`)
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /ВОПРОС ПО ОПЛАТЕ/)
  assert.equal(draft().step, 'message')
  assert.deepEqual(draft().metadata, { source: 'payment_rejection', category: 'payment', subcategory: 'payment_rejected', paymentId: id })
  assert.deepEqual(payment, before)
})

test('rejection shortcut rejects forged ownership and malformed ids', async t => {
  const { ctx, switches } = context(t)
  t.mock.method(PaymentModel as any, 'findById', async () => ({ ...payment, userId: 20 }))
  t.mock.method(TeamModel as any, 'findOne', async () => null)
  await assert.rejects(startSupportFlow(ctx, id), /недоступен/)
  await assert.rejects(startSupportFlow(ctx, 'bad'), /недоступен/)
  assert.equal(switches.length, 0)
  assert.equal(ctx.session.supportDraft, undefined)
})

test('selection messages are consumed; stale callbacks cannot change the current context', async t => {
  const { ctx, click, draft } = context(t)
  await startSupportFlow(ctx)
  assert.equal(await guardSupportSelection(ctx), true)
  await click('s2:category:payment')
  ctx.callbackQuery.message.message_id = 999
  await handleSupportFlowCallback(ctx, 's2:issue:pricing')
  assert.equal(draft().step, 'issues')
  await click('s2:issue:other')
  assert.equal(await guardSupportSelection(ctx), false)
})

test('context card renders rejection, product, amount, status and safe historical fallbacks', () => {
  const text = supportContextText({ category: 'payment', subcategory: 'payment_rejected', paymentId: id }, payment)
  for (const expected of ['Оплата', 'ProContent', '500 ₽', 'Отклонено', 'Сумма не совпадает']) assert.ok(text.includes(expected))
  assert.doesNotMatch(text, /payment_rejected/)
  assert.match(supportContextText({ paymentId: id }), /недоступен/)
  assert.match(supportContextText({ teamId: id }), /недоступна/)
  assert.match(supportContextText({ paymentId: id }, { ...payment, productId: 'old', productTitle: 'Архивный продукт' }), /Архивный продукт/)
  assert.match(supportContextText({ productIds: ['unknown'] }), /unknown/)
})

function mockTicketStorage(t: any) {
  let stored: any = null
  const sent: any[] = [], copies: any[] = []
  t.mock.method(SupportTicketModel as any, 'findOne', () => ({ sort: async () => stored }))
  t.mock.method(SupportTicketModel as any, 'create', async (data: any) => stored = { ...data, id, save: async () => {} })
  t.mock.method(SupportTicketModel as any, 'updateOne', async () => ({}))
  t.mock.method(SupportMessageModel as any, 'findOneAndUpdate', async () => ({}))
  t.mock.method(UserModel as any, 'findOne', async () => ({ fio: 'Тестовый пользователь' }))
  t.mock.method(PaymentModel as any, 'findById', async () => payment)
  t.mock.method(TeamModel as any, 'findById', async () => ({ name: 'Спасение' }))
  t.mock.method(TeamModel as any, 'find', () => ({ select: async () => [] }))
  t.mock.method(auditLogService, 'createLog', async () => ({} as any))
  const api: any = {
    createForumTopic: async () => ({ message_thread_id: 7 }),
    sendMessage: async (...args: any[]) => { sent.push(args); return { message_id: 99 } },
    copyMessage: async (...args: any[]) => { copies.push(args); return { message_id: 100 } },
    closeForumTopic: async () => {},
  }
  return { api, sent, copies, stored: () => stored }
}

for (const metadata of [
  { source: 'payment_rejection', category: 'payment', subcategory: 'payment_rejected', paymentId: id },
  { source: 'support_menu', category: 'team', subcategory: 'no_invite', teamId: id },
  { source: 'support_menu', category: 'subscription', subcategory: 'no_access', productIds: ['procontent', 'cmg'] },
] as const) {
  test(`${metadata.category} metadata persists in the ordinary ticket and context appears in its card`, async t => {
    const { api, stored, sent } = mockTicketStorage(t)
    await createSupportTicketForUser(api, 10, { username: 'tester' }, metadata as any)
    assert.deepEqual(stored().metadata, metadata)
    const card = sent[0][1]
    assert.match(card, /Тема:/)
    assert.match(card, /@tester/)
    if (metadata.category === 'team') assert.match(card, /Спасение/)
    if (metadata.category === 'subscription') { assert.match(card, /ProContent/); assert.match(card, /Church Motion Graphics/) }
    if (metadata.category === 'payment') assert.match(card, /Сумма не совпадает/)
    assert.ok(sent[0][2].reply_markup.inline_keyboard.flat().some((b: any) => b.url === 'tg://user?id=10'))
    const old = stored()
    await createSupportTicketForUser(api, 10, undefined, { category: 'other', source: 'support_menu' })
    assert.equal(stored(), old)
    assert.match(sent[1][1], /Контекст обращения обновлён/)
  })
}

for (const message of [{ text: 'Вопрос' }, { photo: [{ file_id: 'file' }] }, { document: { file_id: 'doc' } }, { voice: { file_id: 'voice' } }, { video: { file_id: 'video' } }]) {
  test(`existing support relay delivers ${Object.keys(message)[0]} once, not to payment`, async t => {
    const { ctx } = context(t)
    await startSupportFlow(ctx)
    await handleSupportFlowCallback(ctx, 'support:start')
    ctx.callbackQuery.message.message_id = ctx.session.supportDraft.messageId
    await handleSupportFlowCallback(ctx, 's2:category:other')
    const { api, copies, stored } = mockTicketStorage(t)
    t.mock.method(ConversationModel as any, 'find', () => ({ sort() { return this }, limit: async () => [] }))
    ctx.api = api
    ctx.message = { message_id: 4, ...message }
    assert.equal(await relayActiveConversationMessage(ctx), false)
    await sendUserMessageToSupport(ctx, 10)
    assert.equal(copies.length, 1)
    assert.equal(copies[0][0], Number(process.env.SUPPORT_GROUP_ID))
    assert.equal(copies[0][3].message_thread_id, 7)
    assert.equal(stored().metadata.category, 'other')
    assert.equal(ctx.session.supportDraft, undefined)
  })
}

test('existing admin support relay keeps media and delivery reaction', async t => {
  const { api, copies } = mockTicketStorage(t)
  t.mock.method(SupportTicketModel as any, 'findOne', async () => ({ id, userId: 10 }))
  const reactions: any[] = []
  const ctx: any = { api, session: {}, chat: { id: Number(process.env.SUPPORT_GROUP_ID), type: 'supergroup' }, from: { id: 99 }, message: { message_id: 5, message_thread_id: 7, document: { file_id: 'doc' } }, react: async (r: any) => reactions.push(r), reply: async () => {} }
  assert.equal(await relayAdminMessage(ctx), true)
  assert.equal(copies.length, 1)
  assert.equal(copies[0][0], 10)
  assert.deepEqual(reactions, ['👍'])
})

test('rejection notification carries the exact payment id and its shortcut permits the owner recipient', async t => {
  const { deliverRejectedPayment } = await import('../src/adapters/telegram/paymentDelivery.js')
  const { ctx, click, draft } = context(t)
  const teamId = '507f1f77bcf86cd799439015'
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10 }))
  t.mock.method(TeamModel as any, 'findOne', async (filter: any) => {
    assert.deepEqual(filter, { _id: teamId, ownerId: 10 })
    return { ownerId: 10 }
  })
  const selected = { ...payment, userId: 20, teamId }
  t.mock.method(PaymentModel as any, 'findById', async () => selected)
  let notification: any
  await deliverRejectedPayment({ sendMessage: async (...args: any[]) => { notification = args } } as any, { applied: true, payment: selected } as any)
  assert.equal(notification[0], 10)
  const callback = notification[2].reply_markup.inline_keyboard[0][0].callback_data
  assert.equal(callback, `s2:reject:${id}`)
  assert.ok(Buffer.byteLength(callback) <= 64)
  await click(callback)
  assert.equal(draft().metadata.paymentId, id)
})

test('explicit support deactivates but never closes payment; each subsequent message has one destination', async t => {
  const { ctx, click } = context(t)
  const active: any = { id: 'payment-conversation', _id: 'payment-conversation', type: 'payment', contextId: id, userId: 10, userActive: true, status: 'open', adminChatId: -100999, adminThreadId: 42, save: async () => {} }
  t.mock.method(ConversationModel as any, 'updateMany', async (_filter: any, update: any) => {
    assert.deepEqual(update, { $set: { userActive: false } })
    active.userActive = false
  })
  t.mock.method(ConversationModel as any, 'find', () => ({ sort() { return this }, limit: async () => active.userActive ? [active] : [] }))
  const { ConversationMessageModel } = await import('../src/models/ConversationMessage.js')
  t.mock.method(ConversationMessageModel as any, 'findOneAndUpdate', async () => ({}))
  t.mock.method(PaymentModel as any, 'findById', async () => payment)
  await click(`s2:reject:${id}`)
  assert.equal(active.status, 'open')
  assert.equal(active.userActive, false)
  const { api, copies, stored } = mockTicketStorage(t)
  ctx.api = api
  ctx.message = { message_id: 4, text: 'Уточнение' }
  ctx.react = async () => {}
  if (!(await relayActiveConversationMessage(ctx))) await sendUserMessageToSupport(ctx, 10)
  assert.deepEqual(copies.map(x => x[0]), [Number(process.env.SUPPORT_GROUP_ID)])
  const ticket = stored()
  // A later explicit admin activation keeps the existing payment-first resolver behavior.
  active.userActive = true
  ctx.message = { message_id: 5, text: 'Ответ по чеку' }
  if (!(await relayActiveConversationMessage(ctx))) await sendUserMessageToSupport(ctx, 10)
  assert.deepEqual(copies.map(x => x[0]), [Number(process.env.SUPPORT_GROUP_ID), -100999])
  assert.equal(stored(), ticket)
  assert.equal(active.status, 'open')
  assert.equal(payment.status, 'rejected')
})

test('schema stores metadata without requiring it for legacy tickets', () => {
  const legacy = new SupportTicketModel({ userId: 10, threadId: 1 })
  assert.equal(legacy.validateSync(), undefined)
  const current = new SupportTicketModel({ userId: 10, threadId: 2, metadata: { category: 'subscription', subcategory: 'no_access', source: 'support_menu', productIds: ['procontent', 'cmg'] } })
  assert.equal(current.validateSync(), undefined)
  assert.deepEqual(current.toObject().metadata?.productIds, ['procontent', 'cmg'])
})

test('large payment histories remain selectable without exceeding keyboard limits', async t => {
  const payments = Array.from({ length: 25 }, (_, i) => ({ ...payment, id: String(i) }))
  const { ctx, click, draft, last } = context(t, [], payments)
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  await click('s2:issue:payment_rejected')
  assert.ok(last().reply_markup.inline_keyboard.flat().length <= 12)
  await click('s2:page:2')
  assert.equal(draft().step, 'payments')
  await click('s2:pick:17')
  assert.equal(draft().metadata.paymentId, '17')
  await click('s2:back')
  assert.equal(draft().step, 'payments')
  await click('s2:back')
  assert.equal(draft().step, 'issues')
})

test('wizard edits one photo caption for category, team, issue, back and subscription checkboxes', async t => {
  const { ctx, click, sent, edits, last, draft } = context(t, [{ id, name: 'Спасение', subscriptions: new Map([['procontent', { status: 'active' }], ['cmg', { status: 'active' }]]) }])
  await startSupportFlow(ctx)
  const messageId = ctx.session.supportUiMessageId
  assert.equal(sent.length, 1)
  assert.equal(edits.length, 0)
  await click('s2:category:team')
  await click('s2:pick:0')
  assert.match(last().text, /Команда: Спасение/)
  await click('s2:issue:no_invite')
  assert.match(last().text, /Команда: Спасение/)
  assert.match(last().text, /Причина: 🔗 Не пришло приглашение/)
  await click('s2:back')
  await click('s2:back')
  await click('s2:back')
  await click('s2:category:subscription')
  await click('s2:issue:no_access')
  await click('s2:pick:0')
  await click('s2:pick:1')
  await click('s2:pick:0')
  await click('s2:continue')
  assert.equal(draft().step, 'message')
  assert.equal(sent.length, 1)
  assert.equal(edits.length, 12)
  assert.ok(edits.every(edit => edit.messageId === messageId && edit.chatId === ctx.chat.id))
  assert.deepEqual(draft().metadata.productIds, ['cmg'])
})

test('payment selection and pagination edit the same service card', async t => {
  const { ctx, click, sent, edits } = context(t, [], Array.from({ length: 12 }, (_, i) => ({ ...payment, id: `${id}${i}` })))
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  await click('s2:issue:payment_rejected')
  await click('s2:page:1')
  await click('s2:pick:9')
  await click('s2:back')
  assert.equal(sent.length, 1)
  assert.equal(edits.length, 5)
  assert.ok(edits.every(edit => edit.messageId === ctx.session.supportUiMessageId))
})

for (const rejected of [false, true]) {
  test(`first real message opens existing SupportTicket and edits the card (rejection=${rejected})`, async t => {
    const { markSupportUiOpened } = await import('../src/ui/supportUi.js')
    const { ctx, click, sent, edits, last } = context(t)
    t.mock.method(PaymentModel as any, 'findById', async () => payment)
    if (rejected) await click(`s2:reject:${id}`)
    else { await startSupportFlow(ctx); await click('s2:category:other') }
    const uiId = ctx.session.supportUiMessageId
    const { api, copies, stored } = mockTicketStorage(t)
    Object.assign(ctx.api, api)
    ctx.message = { message_id: 500, text: 'Настоящее сообщение пользователя' }
    const originalMessage = structuredClone(ctx.message)
    await sendUserMessageToSupport(ctx, 10)
    assert.ok(stored())
    assert.equal(ctx.session.supportDraft, undefined)
    await markSupportUiOpened(ctx)
    assert.match(last().text, /Обращение открыто/)
    assert.deepEqual(last().reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data), ['support:close:user'])
    assert.equal(edits.at(-1).messageId, uiId)
    assert.equal(sent.length, 1)
    assert.equal(copies.length, 1)
    assert.deepEqual(ctx.message, originalMessage)
    assert.ok(edits.every(edit => edit.messageId !== ctx.message.message_id))
    const editCount = edits.length
    await sendUserMessageToSupport(ctx, 10)
    await markSupportUiOpened(ctx)
    assert.equal(edits.length, editCount)
    assert.equal(copies.length, 2)
  })
}

for (const description of ['Bad Request: message to edit not found', "Bad Request: message can't be edited", 'Bad Request: MESSAGE_ID_INVALID']) {
  test(`safe edit failure replaces the UI card: ${description}`, async t => {
    const { ctx, click, sent, draft } = context(t)
    await startSupportFlow(ctx)
    const oldId = ctx.session.supportUiMessageId
    const edit = ctx.api.editMessageCaption
    ctx.api.editMessageCaption = async () => { throw { description } }
    await click('s2:category:payment')
    assert.equal(draft().step, 'issues')
    assert.equal(sent.length, 2)
    assert.notEqual(ctx.session.supportUiMessageId, oldId)
    assert.equal(draft().messageId, ctx.session.supportUiMessageId)
    ctx.api.editMessageCaption = edit
    await click('s2:issue:other')
    assert.equal(sent.length, 2)
  })
}

test('message is not modified is a successful no-op, without fallback or rollback', async t => {
  const { ctx, click, sent, draft } = context(t)
  await startSupportFlow(ctx)
  await click('s2:category:payment')
  const uiId = ctx.session.supportUiMessageId
  // Simulates retrying an edit that Telegram already applied.
  ctx.api.editMessageCaption = async () => { throw { description: 'Bad Request: message is not modified' } }
  await click('s2:issue:other')
  assert.equal(draft().step, 'message')
  assert.equal(sent.length, 1)
  assert.equal(ctx.session.supportUiMessageId, uiId)
})

test('transient edit failure does not create duplicate cards or report successful relay as failed', async t => {
  const { renderSupportUi, markSupportUiOpened } = await import('../src/ui/supportUi.js')
  const { InlineKeyboard } = await import('grammy')
  const { ctx, sent } = context(t)
  await startSupportFlow(ctx)
  ctx.api.editMessageCaption = async () => { throw new Error('Network timeout') }
  t.mock.method(console, 'error', () => {})
  await assert.rejects(renderSupportUi(ctx, 'test', new InlineKeyboard()), /Network timeout/)
  await assert.doesNotReject(markSupportUiOpened(ctx))
  assert.equal(sent.length, 1)
  assert.equal(ctx.session.supportUiOpened, false)
})

test('close updates the service card and retains normal Support entry without adding user reopen logic', async t => {
  const { markSupportUiOpened, markSupportUiClosed } = await import('../src/ui/supportUi.js')
  const { ctx, sent, last } = context(t)
  await startSupportFlow(ctx)
  await markSupportUiOpened(ctx)
  assert.equal(await markSupportUiClosed(ctx, 'Обращение завершено.'), true)
  assert.equal(sent.length, 1)
  assert.match(last().text, /Обращение завершено/)
  assert.equal(last().reply_markup.inline_keyboard[0][0].callback_data, 'support:start')
})

test('main menu opens restored Help; support and back edit that same photo', async t => {
  const { mainScreen } = await import('../src/screens/main.js')
  const { supportScreen, HELP_PHOTO } = await import('../src/screens/support.js')
  const { registerScreens, renderScreen } = await import('../src/core/render.js')
  const { handleOpen } = await import('../src/handlers/navigation.hadlers.js')
  const { getUi, setUiMessageId } = await import('../src/state/ui.js')
  const { packCb, parseCb } = await import('../src/core/callback.js')
  const { ctx, click, sent, edits, last } = context(t)
  const mediaEdits: any[] = []
  ctx.api.editMessageMedia = async (...args: any[]) => { mediaEdits.push(args) }
  registerScreens({ main: mainScreen, support: supportScreen } as any)
  setUiMessageId(10, 77)
  t.mock.method(UserModel as any, 'updateOne', async () => ({}))
  t.mock.method(SupportTicketModel as any, 'create', () => assert.fail('ticket created before user message'))
  const helpCallback = mainScreen(10).keyboard.inline_keyboard.flat()
    .find(b => 'callback_data' in b && b.callback_data === packCb({ a: 'open', s: 'support' }))
  assert.ok(helpCallback && 'callback_data' in helpCallback)
  const parsedHelpCallback = parseCb(helpCallback.callback_data)
  assert.ok(parsedHelpCallback)
  await handleOpen(ctx, 10, parsedHelpCallback)
  assert.equal(mediaEdits.length, 1)
  const root = mediaEdits[0][2]
  assert.equal(root.media.fileData, HELP_PHOTO)
  assert.match(root.caption, /🆘 ПОМОЩЬ/)
  assert.match(root.caption, /Если появились вопросы по работе ХАБ/)
  const buttons = mediaEdits[0][3].reply_markup.inline_keyboard.flat()
  assert.deepEqual(buttons.find((b: any) => b.text === 'Написать разработчику'), {
    text: 'Написать разработчику', url: 'https://t.me/vitaly_kolodchenko', icon_custom_emoji_id: '5818813162815753343',
  })
  assert.ok(buttons.some((b: any) => b.callback_data === 'support:start'))
  assert.ok(!buttons.some((b: any) => b.callback_data?.startsWith('s2:category:')))
  assert.equal(ctx.session.supportDraft, undefined)
  await click('support:start')
  assert.match(last().caption, /С чем вам нужна помощь/)
  await click('s2:category:payment')
  await click('s2:issue:other')
  await click('s2:back')
  await click('s2:back')
  await click('s2:back')
  assert.equal(last().caption, root.caption)
  assert.equal(ctx.session.supportDraft, undefined)
  assert.equal(ctx.session.inSupportMode, false)
  assert.equal(sent.length, 0)
  assert.equal(mediaEdits.length, 1)
  assert.ok(edits.every(e => e.messageId === 77))
  assert.equal(getUi(10).uiMessageId, 77)
  await click('support:start')
  assert.equal(ctx.session.supportDraft.metadata.category, undefined)
  assert.equal(ctx.session.supportDraft.history.length, 0)
  // When the shared menu returns home, subsequent support must not caption the main image.
  await renderScreen(ctx, 10, 'main')
  assert.equal(ctx.session.supportUiMessageId, undefined)
  await startSupportFlow(ctx)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].photo.fileData, HELP_PHOTO)
})

test('new Help registers its photo id; repeated Help rendering only edits caption', async t => {
  const { supportScreen } = await import('../src/screens/support.js')
  const { registerScreens, renderScreen } = await import('../src/core/render.js')
  const { ctx, sent, edits } = context(t)
  registerScreens({ support: supportScreen } as any)
  await renderScreen(ctx, 10, 'support', undefined, { forceNew: true })
  assert.equal(sent.length, 1)
  assert.equal(ctx.session.supportUiMessageId, 1)
  await renderScreen(ctx, 10, 'support')
  assert.equal(sent.length, 1)
  assert.equal(edits.length, 1)
  assert.equal(edits[0].messageId, 1)
})

test('photo fallback updates both menu and draft ids and subsequent back edits replacement', async t => {
  const { getUi } = await import('../src/state/ui.js')
  const { HELP_PHOTO } = await import('../src/screens/support.js')
  const { ctx, click, sent, edits } = context(t)
  await startSupportFlow(ctx)
  const edit = ctx.api.editMessageCaption
  ctx.api.editMessageCaption = async () => { throw { description: 'message to edit not found' } }
  await click('s2:category:other')
  assert.equal(sent.length, 2)
  assert.ok(sent.every(s => s.photo.fileData === HELP_PHOTO))
  assert.equal(getUi(10).uiMessageId, 2)
  assert.equal(ctx.session.supportDraft.messageId, 2)
  ctx.api.editMessageCaption = edit
  await click('s2:back')
  await click('s2:back')
  assert.equal(sent.length, 2)
  assert.ok(edits.every(e => e.messageId === 2))
})

test('rejection shortcut reuses existing Help photo without editing payment notification', async t => {
  const { ctx, click, edits, sent } = context(t)
  ctx.session.supportUiMessageId = 77
  ctx.callbackQuery.message = { message_id: 88, text: 'Payment rejected' }
  t.mock.method(PaymentModel as any, 'findById', async () => payment)
  await handleSupportFlowCallback(ctx, `s2:reject:${id}`)
  assert.equal(sent.length, 0)
  assert.equal(edits.length, 1)
  assert.equal(edits[0].messageId, 77)
  assert.match(edits[0].caption, /ВОПРОС ПО ОПЛАТЕ/)
  assert.equal(ctx.callbackQuery.message.text, 'Payment rejected')
  await click('s2:back')
  assert.equal(ctx.session.supportDraft.metadata.paymentId, undefined)
})

test('caption remains within Telegram limit even with long names and astral emoji', async t => {
  const { renderSupportUi } = await import('../src/ui/supportUi.js')
  const { InlineKeyboard } = await import('grammy')
  const { ctx, last } = context(t)
  await renderSupportUi(ctx, 'a'.repeat(1021) + '😀'.repeat(20), new InlineKeyboard())
  assert.ok(last().caption.length <= 1024)
  assert.ok(last().caption.endsWith('…'))
  assert.doesNotMatch(last().caption, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
})
