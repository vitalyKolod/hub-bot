import assert from 'node:assert/strict'
import test from 'node:test'
import { validEmail, validTelegramId, normalizeEmail, assignKnownUserToStream, bindKnownUser } from '../src/services/yandex360.service.js'
import { Yandex360MemberModel, Yandex360RequestModel, Yandex360StreamModel } from '../src/models/Yandex360.js'
import { UserModel } from '../src/models/User.js'
import { auditLogService } from '../src/services/auditLog.service.js'
import { formatYandex360DateTime, yandex360AccessState, yandex360Screen } from '../src/screens/yandex360.js'
import { SUPPORT_CATEGORIES, SUPPORT_ISSUES } from '../src/services/supportContext.js'

test('Telegram IDs and emails are validated before linking or requests', () => {
  assert.equal(validTelegramId('123456789'), true)
  for (const value of ['0', '-1', 'abc', '1.2', '9007199254740999']) assert.equal(validTelegramId(value), false)
  assert.equal(validEmail(' Person@Example.com '), true)
  assert.equal(normalizeEmail(' Person@Example.com '), 'person@example.com')
  for (const value of ['invalid', 'a@', '@host.com']) assert.equal(validEmail(value), false)
})
test('member schema protects unique Telegram and bot User links', () => {
  const indexes = Yandex360MemberModel.schema.indexes()
  assert.ok(indexes.some(([keys, options]) => keys.telegramId === 1 && options.unique))
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && options.unique))
  assert.ok(indexes.some(([keys, options]) => keys.importKey === 1 && options.unique))
})

test('registration clears a Yandex 360 record linked to a deleted profile', async (t) => {
  const member = { _id: 'old-member', userId: 'deleted-user', telegramId: 123 }
  const events: string[] = []
  t.mock.method(UserModel as any, 'findOne', async () => ({ _id: 'new-user' }))
  t.mock.method(UserModel as any, 'exists', async () => null)
  t.mock.method(Yandex360MemberModel as any, 'findOne', async () => member)
  t.mock.method(Yandex360RequestModel as any, 'deleteMany', async (filter: any) => {
    assert.deepEqual(filter, { memberId: member._id })
    events.push('requests')
  })
  t.mock.method(Yandex360MemberModel as any, 'deleteOne', async (filter: any) => {
    assert.deepEqual(filter, { _id: member._id, userId: member.userId })
    events.push('member')
  })
  assert.equal(await bindKnownUser(123), null)
  assert.deepEqual(events, ['requests', 'member'])
})

test('Yandex 360 shows exact Moscow time and derives access only from the end date', () => {
  assert.match(formatYandex360DateTime(new Date('2027-09-28T00:00:00.000Z')), /28\.09\.2027,? 03:00:00 МСК/)
  const now = new Date('2026-09-28T00:00:00.000Z')
  assert.deepEqual(yandex360AccessState({ status: 'active', endsAt: new Date('2026-09-30T00:00:00.000Z') }, now),
    { label: '✅ Активен', active: true, daysLeft: 2 })
  assert.equal(yandex360AccessState({ status: 'active', endsAt: now }, now).active, false)
  assert.equal(yandex360AccessState({ status: 'closed', endsAt: new Date('2027-09-28') }, now).active, false)
  assert.equal(yandex360AccessState({ status: 'active', startsAt: new Date('2026-09-29') }, now).active, true)
})

test('Yandex 360 screen shows stream members and a chat button for active access', async (t) => {
  const userId = 101
  const userObjectId = '507f1f77bcf86cd799439011'
  const streamId = '507f1f77bcf86cd799439012'
  t.mock.method(UserModel as any, 'findOne', async () => ({ _id: userObjectId }))
  let hasConnectedEmail = true
  t.mock.method(Yandex360MemberModel as any, 'findOne', async () => ({
    _id: '507f1f77bcf86cd799439013', userId: userObjectId, telegramId: userId,
    streamId, emails: hasConnectedEmail ? [{ address: 'mine@example.com', status: 'connected', _id: '507f1f77bcf86cd799439014' }] : [],
  }))
  let streamStatus = 'active'
  t.mock.method(Yandex360StreamModel as any, 'findById', async () => ({
    _id: streamId, name: '2', status: streamStatus,
    startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000),
    chatLink: 'https://t.me/+sample',
  }))
  t.mock.method(Yandex360MemberModel as any, 'find', () => ({
    select: () => ({ sort: () => ({ lean: async () => [
      { name: 'Иван', telegramId: userId }, { name: 'Мария', telegramId: 102 },
    ] }) }),
  }))
  const active = await yandex360Screen(userId)
  assert.match(active.caption, /ПОТОК 2/)
  assert.match(active.caption, /Активен/)
  assert.match(active.caption, /Осталось: 1 дн/)
  assert.doesNotMatch(active.caption, /Начало:/)
  assert.match(active.caption, /УЧАСТНИКИ ПОТОКА \(2\)/)
  assert.match(active.caption, /Иван \(вы\)/)
  assert.match(active.caption, /Мария/)
  assert.doesNotMatch(active.caption, /https:\/\/t\.me/)
  assert.ok(active.caption_entities?.some(entity => entity.type === 'custom_emoji'))
  assert.equal(active.keyboard.inline_keyboard[0][0].url, 'https://t.me/+sample')
  const replaceEmail = active.keyboard.inline_keyboard.flat().find(button => button.text === 'Заменить свой email')
  assert.equal(replaceEmail?.callback_data, 'y360:replace:507f1f77bcf86cd799439014')
  assert.equal(active.keyboard.inline_keyboard.flat().some(button => button.callback_data === 'y360:add'), false)
  const back = active.keyboard.inline_keyboard.flat().find(button => button.text === '◀️ НАЗАД')
  assert.equal(back?.icon_custom_emoji_id, undefined)

  hasConnectedEmail = false
  const withoutEmail = await yandex360Screen(userId)
  assert.equal(withoutEmail.keyboard.inline_keyboard.flat().find(button => button.text === '➕ Добавить свой email')?.callback_data, 'y360:add')
  assert.equal(withoutEmail.keyboard.inline_keyboard.flat().some(button => button.callback_data?.startsWith('y360:replace:')), false)

  streamStatus = 'closed'
  const inactive = await yandex360Screen(userId)
  assert.match(inactive.caption, /Неактивен/)
  assert.equal(inactive.keyboard.inline_keyboard.flat().some(button => 'url' in button && button.url === 'https://t.me/+sample'), false)
})

test('Yandex 360 admin email notification identifies the participant, stream and proposed address', async () => {
  const { formatYandex360EmailRequestNotification } = await import('../src/handlers/yandex360.handlers.js')
  const text = formatYandex360EmailRequestNotification({
    memberName: 'Виталий', telegramId: 12345, streamName: '2',
    email: 'new@example.com', oldEmail: 'old@example.com',
  })
  assert.match(text, /Виталий/)
  assert.match(text, /Telegram ID: 12345/)
  assert.match(text, /Поток: 2/)
  assert.match(text, /old@example\.com/)
  assert.match(text, /new@example\.com/)
})
test('support includes Yandex 360 reasons', () => {
  assert.ok(SUPPORT_CATEGORIES.yandex360)
  assert.deepEqual(Object.keys(SUPPORT_ISSUES.yandex360), ['add_email','change_email','access','stream','other'])
})

test('Yandex 360 admin callbacks deny a non-admin before accessing records', async () => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const replies: any[] = []
  const ctx: any = { from: { id: 987654321 }, session: {}, answerCallbackQuery: async (v: any) => replies.push(v) }
  assert.equal(await handleYandex360Callback(ctx, 'y360:s:507f1f77bcf86cd799439011'), true)
  assert.equal(replies[0].text, 'Нет прав')
})

test('known HUB user is assigned once to the selected Yandex 360 stream', async (t) => {
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  const streamId = '507f1f77bcf86cd799439021'
  const userId = '507f1f77bcf86cd799439022'
  const user = { _id: userId, telegramId: 12345, fio: 'Виталий', username: 'vitaly' }
  const stream = { _id: streamId, name: '2', status: 'active', capacity: 2 }
  let existing: any = null
  let creates = 0
  t.mock.method(UserModel as any, 'findOne', async () => user)
  t.mock.method(Yandex360StreamModel as any, 'findById', async (id: string) =>
    id === streamId ? stream : { ...stream, _id: id, name: 'другой' })
  t.mock.method(Yandex360MemberModel as any, 'findOne', async () => existing)
  t.mock.method(Yandex360MemberModel as any, 'find', () => ({ select: () => ({ lean: async () => [] }) }))
  t.mock.method(Yandex360MemberModel as any, 'create', async (payload: any) => {
    creates++
    existing = { _id: '507f1f77bcf86cd799439023', ...payload }
    return existing
  })
  t.mock.method(auditLogService as any, 'createLog', async () => ({}))

  const first = await assignKnownUserToStream(912345678, 12345, streamId)
  assert.equal(first.created, true)
  assert.equal(first.member.name, 'Виталий')
  assert.equal(first.member.telegramId, 12345)
  assert.equal(first.member.streamId, streamId)
  assert.equal((await assignKnownUserToStream(912345678, 12345, streamId)).created, false)
  assert.equal(creates, 1)
  await assert.rejects(assignKnownUserToStream(912345678, 12345, '507f1f77bcf86cd799439024'), /другой поток/)
})

test('Yandex 360 user shortcut selects a stream without retyping Telegram ID', async (t) => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  const streamId = '507f1f77bcf86cd799439021'
  t.mock.method(UserModel as any, 'findOne', async () => ({ _id: '507f1f77bcf86cd799439022', fio: 'Виталий' }))
  t.mock.method(Yandex360MemberModel as any, 'findOne', async () => null)
  t.mock.method(Yandex360StreamModel as any, 'find', () => ({ sort: () => ({ limit: async () => [
    { _id: streamId, name: '2', status: 'active', capacity: 10 },
  ] }) }))
  t.mock.method(Yandex360MemberModel as any, 'find', () => ({ select: () => ({ lean: async () => [] }) }))
  const edits: any[] = []
  const ctx: any = {
    from: { id: 912345678 }, chat: { id: 912345678 }, session: {},
    callbackQuery: { message: { message_id: 17, chat: { id: 912345678 } } },
    api: { editMessageText: async (...args: any[]) => edits.push(args) },
    reply: () => assert.fail('opened a new message'), answerCallbackQuery: async () => {},
  }
  assert.equal(await handleYandex360Callback(ctx, 'y360:user:12345'), true)
  assert.match(edits[0][2], /Виталий/)
  const button = edits[0][3].reply_markup.inline_keyboard.flat()
    .find((item: any) => item.callback_data === `y360:assign:12345:${streamId}`)
  assert.equal(button?.icon_custom_emoji_id, '5310051278464778081')
})

test('approving an email renders a confirmed button and every callback stays within Telegram limit', async (t) => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  const memberId = '507f1f77bcf86cd799439031'
  const emailId = '507f1f77bcf86cd799439032'
  const requestId = '507f1f77bcf86cd799439033'
  const email = { _id: emailId, address: 'person@example.com', status: 'pending', decidedBy: null, decidedAt: null }
  const emails: any = [email]
  emails.id = (id: string) => id === emailId ? email : null
  const member = { _id: memberId, streamId: '507f1f77bcf86cd799439034',
    telegramId: 12345, name: 'Виталий', username: '', seats: 1, amount: null, note: '',
    emails, async save() {} }
  const request = { _id: requestId, memberId, oldEmailId: null, proposedEmail: email.address }
  t.mock.method(Yandex360MemberModel as any, 'findById', async () => member)
  t.mock.method(Yandex360RequestModel as any, 'find', async () => [])
  t.mock.method(Yandex360RequestModel as any, 'findOneAndUpdate', async () => request)
  t.mock.method(auditLogService as any, 'createLog', async () => ({}))
  const edits: any[] = []
  const ctx: any = { from: { id: 912345678 }, chat: { id: 912345678 }, session: {},
    callbackQuery: { message: { message_id: 17, chat: { id: 912345678 } } },
    api: { editMessageText: async (...args: any[]) => edits.push(args), sendMessage: async () => ({}) },
    answerCallbackQuery: async () => {}, reply: () => assert.fail('opened a new message') }

  await handleYandex360Callback(ctx, `y360:decide:${requestId}:yes`)
  assert.equal(email.status, 'connected')
  const buttons = edits.at(-1)[3].reply_markup.inline_keyboard.flat()
  assert.ok(buttons.some((button: any) => button.text === '✅ Подтверждено · person@example.com'))
  for (const button of buttons) {
    if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, button.callback_data)
  }
  assert.ok(buttons.some((button: any) => button.callback_data === `y360:de:${memberId}:${emailId}`))
})

test('Yandex 360 dates use the admin DD.MM.YYYY format and reject rollover', async () => {
  const { parseYandex360Date } = await import('../src/services/yandex360.service.js')
  assert.equal(parseYandex360Date('28.09.2026')?.toISOString(), '2026-09-28T00:00:00.000Z')
  assert.equal(parseYandex360Date('-'), null)
  assert.throws(() => parseYandex360Date('2026-09-28'), /ДД.ММ.ГГГГ/)
  assert.throws(() => parseYandex360Date('31.02.2026'), /Некорректная дата/)
})

test('Yandex 360 removes text entered into its forms even when validation fails', async () => {
  const { handleYandex360Text } = await import('../src/handlers/yandex360.handlers.js')
  const deleted: any[] = []
  const replies: string[] = []
  const ctx: any = {
    from: { id: 987654321 }, chat: { id: 987654321, type: 'private' },
    message: { message_id: 42, text: 'https://t.me/example' },
    session: { y360Input: { mode: 'editstream', id: 'stream-id', field: 'chatLink' } },
    api: { deleteMessage: async (...args: any[]) => deleted.push(args) },
    reply: async (text: string) => replies.push(text),
  }
  assert.equal(await handleYandex360Text(ctx), true)
  assert.deepEqual(deleted, [[987654321, 42]])
  assert.match(replies[0], /Нет прав/)
})

test('main menu uses Yandex 360 media navigation with the requested custom icon', async () => {
  const { mainScreen } = await import('../src/screens/main.js')
  const buttons = mainScreen(1).keyboard.inline_keyboard.flat()
  const button = buttons.find(button => button.text === 'Яндекс 360')
  assert.equal(button?.callback_data, 'a=open&s=yandex360')
  assert.equal(button?.icon_custom_emoji_id, '5310051278464778081')
})

test('Yandex 360 list edits the current admin message and shows only streams, creation, requests', async t => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const { Yandex360StreamModel } = await import('../src/models/Yandex360.js')
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  t.mock.method(Yandex360StreamModel as any, 'find', () => ({ sort: () => ({ limit: async () => [] }) }))
  const edited: any[] = []
  const ctx: any = {
    from: { id: 912345678 }, chat: { id: 912345678 }, session: {},
    callbackQuery: { message: { message_id: 17, chat: { id: 912345678 } } },
    api: { editMessageText: async (...args: any[]) => edited.push(args) },
    reply: () => assert.fail('opened a new message'), answerCallbackQuery: async () => {},
  }
  assert.equal(await handleYandex360Callback(ctx, 'y360:admin'), true)
  assert.equal(edited[0][1], 17)
  const buttons = edited[0][3].reply_markup.inline_keyboard.flat().map((button: any) => button.text)
  assert.deepEqual(buttons, ['➕ Новый поток', '📋 Заявки на поток', '‹ Меню'])
})

test('optional Telegram ID advances participant draft to confirmation', async t => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  const session: any = { y360Input: { mode: 'newmember_id', streamId: 'stream123', name: 'Пример' } }
  const edited: any[] = []
  const ctx: any = {
    from: { id: 912345678 }, chat: { id: 912345678 }, session,
    callbackQuery: { message: { message_id: 17, chat: { id: 912345678 } } },
    api: { editMessageText: async (...args: any[]) => edited.push(args) },
    reply: () => assert.fail('opened a new message'), answerCallbackQuery: async () => {},
  }
  await handleYandex360Callback(ctx, 'y360:membernoid:stream123')
  assert.equal(session.y360Input.mode, 'newmember_confirm')
  assert.match(edited[0][2], /ID: пока неизвестен/)
})

test('stream status is selected by checked buttons, without text input', async t => {
  const { handleYandex360Callback } = await import('../src/handlers/yandex360.handlers.js')
  const { Yandex360StreamModel } = await import('../src/models/Yandex360.js')
  const previous = process.env.ADMIN_IDS
  process.env.ADMIN_IDS = '912345678'
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = previous })
  t.mock.method(Yandex360StreamModel as any, 'findById', async () => ({ name: '2', status: 'active' }))
  const edited: any[] = []
  const session: any = {}
  const ctx: any = {
    from: { id: 912345678 }, chat: { id: 912345678 }, session,
    callbackQuery: { message: { message_id: 17, chat: { id: 912345678 } } },
    api: { editMessageText: async (...args: any[]) => edited.push(args) },
    reply: () => assert.fail('opened a new message'), answerCallbackQuery: async () => {},
  }
  await handleYandex360Callback(ctx, 'y360:statusmenu:507f1f77bcf86cd799439011')
  const buttons = edited[0][3].reply_markup.inline_keyboard.flat()
  assert.equal(buttons[0].text, '✅ Активен')
  assert.equal(buttons[1].text, 'Неактивен')
  assert.equal(session.y360Input, undefined)
  assert.doesNotMatch(edited[0][2], /Введите active или closed/)
})
