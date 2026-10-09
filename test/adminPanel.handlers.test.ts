import assert from 'node:assert/strict'
import test from 'node:test'

import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import { apCb } from '../src/constants/admin-panel.js'
import { AuditLogModel } from '../src/models/AuditLog.js'
import { ProPresenterWaitlistModel } from '../src/models/ProPresenterWaitlist.js'
import { ProPresenterRequestBatchModel } from '../src/models/ProPresenterRequestBatch.js'

process.env.ADMIN_IDS = '111,222'
process.env.ADMIN_GROUP_ID ||= '-100000000001'
process.env.CONTENT_GROUP_ID ||= '-100000000002'
process.env.SUPPORT_GROUP_ID ||= '-100000000003'
process.env.SUNDAY_SCREENS_GROUP_ID ||= '-100000000004'
process.env.PROP_WAITLIST_THREAD_ID ||= '10'
process.env.PROP_STREAM_VERIFY_THREAD_ID ||= '11'

const { handleAdminPanelCallback, handleAdminPanelText, showAdminPanelMenu, showAdminUserCard } = await import(
  '../src/handlers/adminPanel.handlers.js'
)

test('management menu uses only the configured custom icons on section buttons', async (t) => {
  t.mock.method(ProPresenterWaitlistModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterWaitlistModel as any, 'aggregate', async () => [{ _id: 21, count: 2 }])
  t.mock.method(ProPresenterRequestBatchModel as any, 'find', () => ({ lean: async () => [] }))
  const { ctx, edits } = callbackContext(111, apCb('menu'))
  await showAdminPanelMenu(ctx)
  const buttons = keyboardButtons(edits[0])
  const expected = new Map([
    ['Юзеры', '5440764424820377609'],
    ['Команды', '5296533616224906961'],
    ['Потоки ProPresenter', '5251272469175631339'],
    ['Заявки на поток №21 (2/20)', '6323602795123443087'],
    ['Потоки Яндекс 360', '5310051278464778081'],
    ['Администраторы', '5836690092306992715'],
  ])
  for (const [label, icon] of expected) {
    const button: any = buttons.find((item) => item.text === label)
    assert.equal(button?.icon_custom_emoji_id, icon)
    assert.doesNotMatch(label, /^[👥🏘📡📋👮]/u)
  }
})

type RecordedEdit = {
  chatId?: number
  messageId?: number
  text: string
  options: any
}

function callbackContext(
  adminId: number,
  data: string,
  session: Record<string, any> = {},
  messageId = 50
) {
  const edits: RecordedEdit[] = []
  const answers: any[] = []
  const replies: any[] = []
  const chat = { id: -900, type: 'supergroup' as const }
  const ctx: any = {
    from: { id: adminId },
    chat,
    callbackQuery: {
      data,
      message: { message_id: messageId, chat, date: 0, text: 'admin screen' },
    },
    session,
    editMessageText: async (text: string, options: any) => {
      edits.push({ text, options })
      return true
    },
    answerCallbackQuery: async (options?: any) => {
      answers.push(options)
      return true
    },
    reply: async (text: string, options: any) => {
      replies.push({ text, options })
      return { chat, message_id: 100 + replies.length }
    },
    api: {
      editMessageText: async (
        chatId: number,
        targetMessageId: number,
        text: string,
        options: any
      ) => {
        edits.push({ chatId, messageId: targetMessageId, text, options })
        return true
      },
      deleteMessage: async () => true,
    },
  }
  return { ctx, edits, answers, replies }
}

function textContext(
  adminId: number,
  text: string,
  session: Record<string, any>,
  edits: RecordedEdit[]
) {
  const replies: any[] = []
  const chat = { id: -900, type: 'supergroup' as const }
  const ctx: any = {
    from: { id: adminId },
    chat,
    deleteMessage: async () => true,
    message: { message_id: 80, date: 0, chat, from: { id: adminId }, text },
    session,
    api: {
      editMessageText: async (
        chatId: number,
        messageId: number,
        nextText: string,
        options: any
      ) => {
        edits.push({ chatId, messageId, text: nextText, options })
        return true
      },
      deleteMessage: async () => true,
    },
    reply: async (replyText: string, options: any) => {
      replies.push({ text: replyText, options })
      return { chat, message_id: 100 + replies.length }
    },
  }
  return { ctx, replies }
}

function keyboardButtons(edit: RecordedEdit) {
  return edit.options.reply_markup.inline_keyboard.flat() as Array<{
    text: string
    callback_data?: string
    url?: string
  }>
}

test('user card includes contact, create and delete actions in the expected order', async (t) => {
  const targetId = 6457509398
  const team = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Спасение',
    ownerId: targetId,
  }
  t.mock.method(UserModel as any, 'findOne', async () => ({
    telegramId: targetId,
    fio: null,
    username: null,
    city: null,
    church: null,
    reg: 'none',
  }))
  t.mock.method(TeamModel as any, 'find', async () => [team])

  const { ctx, edits } = callbackContext(111, apCb('u', targetId))
  assert.equal(await handleAdminPanelCallback(ctx, ctx.callbackQuery.data), true)
  assert.equal(edits.length, 1)

  const buttons = keyboardButtons(edits[0])
  const labels = buttons.map((button) => button.text)
  assert.equal(buttons.some((button) => button.text === '💬 Написать пользователю'), false)
  assert.equal(buttons.find((button) => button.text === '👤 Открыть Telegram-профиль')?.url, `tg://user?id=${targetId}`)
  assert.ok(labels.indexOf('👥 Спасение') < labels.indexOf('➕ Создать команду'))
  const yandexButton: any = buttons.find((button) => button.text === '➕ Добавить Яндекс 360')
  assert.equal(yandexButton?.callback_data, `y360:user:${targetId}`)
  assert.equal(yandexButton?.icon_custom_emoji_id, '5310051278464778081')
  assert.ok(labels.indexOf('➕ Создать команду') < labels.indexOf('➕ Добавить в команду'))
  assert.ok(labels.indexOf('🗑 Удалить юзера') < labels.indexOf('‹ К списку'))
  assert.equal(
    buttons.find((button) => button.text === '👥 Спасение')?.callback_data,
    'ap:t:507f1f77bcf86cd799439011'
  )
})

test('delete action opens an explicit destructive confirmation for the same user', async (t) => {
  t.mock.method(UserModel as any, 'findOne', async () => ({
    telegramId: 700,
    fio: 'Иван Иванов',
  }))
  t.mock.method(TeamModel as any, 'find', async () => [
    { ownerId: 700 },
    { ownerId: 701 },
  ])

  const { ctx, edits } = callbackContext(111, apCb('u', 700, 'del'))
  await handleAdminPanelCallback(ctx, ctx.callbackQuery.data)

  assert.match(edits[0].text, /Это действие нельзя отменить/)
  assert.match(edits[0].text, /Собственные команды: 1/)
  assert.match(edits[0].text, /Участие в чужих командах: 1/)
  const confirm = keyboardButtons(edits[0]).find(
    (button) => button.text === '✅ Да, удалить полностью'
  )
  assert.equal(confirm?.callback_data, 'ap:u:700:del:yes')
})

test('manual create state remains isolated for two admins and refreshes the original cards', async (t) => {
  const users = new Map<number, any>([
    [1001, { telegramId: 1001, fio: 'Первый', city: '', church: '', reg: 'done' }],
    [1002, { telegramId: 1002, fio: 'Второй', city: '', church: '', reg: 'done' }],
  ])
  const teams: any[] = []
  let nextTeamId = 1

  t.mock.method(UserModel as any, 'findOne', async (filter: any) => users.get(filter.telegramId) || null)
  t.mock.method(UserModel as any, 'exists', async (filter: any) =>
    users.has(filter.telegramId) ? { _id: `user-${filter.telegramId}` } : null
  )
  t.mock.method(TeamModel as any, 'create', async (payload: any) => {
    const team = {
      _id: { toString: () => `team-${nextTeamId++}` },
      ...payload,
      createdAt: new Date(),
    }
    teams.push(team)
    return team
  })
  t.mock.method(TeamModel as any, 'findById', async (teamId: string) =>
    teams.find((team) => team._id.toString() === teamId)
  )
  t.mock.method(TeamModel as any, 'find', async (filter: any) => {
    const targetId = filter.$or[0].ownerId
    return teams.filter(
      (team) =>
        team.ownerId === targetId ||
        team.members.some((member: any) => member.telegramId === targetId)
    )
  })
  t.mock.method(console, 'info', () => {})
  t.mock.method(AuditLogModel as any, 'create', async (payload: any) => ({
    ...payload,
    createdAt: new Date(),
  }))

  const sessionA: Record<string, any> = {}
  const sessionB: Record<string, any> = {}
  const startA = callbackContext(111, apCb('u', 1001, 'ct', 'm'), sessionA, 61)
  const startB = callbackContext(222, apCb('u', 1002, 'ct', 'm'), sessionB, 62)

  await handleAdminPanelCallback(startA.ctx, startA.ctx.callbackQuery.data)
  await handleAdminPanelCallback(startB.ctx, startB.ctx.callbackQuery.data)
  assert.equal(sessionA.adminPanelInput.telegramId, 1001)
  assert.equal(sessionB.adminPanelInput.telegramId, 1002)

  const textB = textContext(222, ' Second   Team ', sessionB, startB.edits)
  const textA = textContext(111, ' Media   Team ', sessionA, startA.edits)
  assert.equal(await handleAdminPanelText(textB.ctx), true)
  assert.equal(await handleAdminPanelText(textA.ctx), true)

  assert.equal(sessionA.adminPanelInput, undefined)
  assert.equal(sessionB.adminPanelInput, undefined)
  assert.deepEqual(
    teams.map((team) => ({ name: team.name, ownerId: team.ownerId, member: team.members[0] })),
    [
      {
        name: 'Second Team',
        ownerId: 1002,
        member: { telegramId: 1002, role: 'owner', status: 'active' },
      },
      {
        name: 'Media Team',
        ownerId: 1001,
        member: { telegramId: 1001, role: 'owner', status: 'active' },
      },
    ]
  )
  assert.ok(startA.edits.some((edit) => edit.messageId === 61 && edit.text.includes('Media Team')))
  assert.ok(startB.edits.some((edit) => edit.messageId === 62 && edit.text.includes('Second Team')))
  assert.equal(textA.replies.length, 0)
  assert.equal(textB.replies.length, 0)
})

test('empty manual name keeps the same admin in input mode without creating a team', async (t) => {
  let createCalled = false
  t.mock.method(TeamModel as any, 'create', async () => {
    createCalled = true
    return null
  })
  const session = {
    adminPanelInput: {
      mode: 'create_team_name',
      telegramId: 1001,
      sourceChatId: -900,
      sourceMessageId: 61,
    },
  }
  const edits: RecordedEdit[] = []
  const { ctx, replies } = textContext(111, '   ', session, edits)

  assert.equal(await handleAdminPanelText(ctx), true)
  assert.equal(session.adminPanelInput.mode, 'create_team_name')
  assert.equal(createCalled, false)
  assert.equal(replies.length, 0)
  assert.match(edits[0].text, /не может быть пустым/)
})

test('new callback payloads remain below Telegram 64-byte limit and contain no profile data', () => {
  const targetId = Number.MAX_SAFE_INTEGER
  const callbacks = [
    apCb('u', targetId, 'ct'),
    apCb('u', targetId, 'ct', 'g'),
    apCb('u', targetId, 'ct', 'm'),
    apCb('u', targetId, 'del'),
    apCb('u', targetId, 'del', 'yes'),
    apCb('u', targetId),
  ]
  for (const callback of callbacks) {
    assert.ok(Buffer.byteLength(callback, 'utf8') <= 64)
    assert.doesNotMatch(callback, /Спасение|Краснодар|Иван/)
  }
})

test('non-admin callbacks are consumed and denied before any database access', async () => {
  const { ctx, answers } = callbackContext(999, apCb('u', 700, 'del'))
  assert.equal(await handleAdminPanelCallback(ctx, ctx.callbackQuery.data), true)
  assert.deepEqual(answers[0], { text: 'Нет доступа' })
})

test('support user card is sent separately and keeps the source audit message intact', async (t) => {
  t.mock.method(UserModel as any, 'findOne', async () => ({
    telegramId: 700,
    fio: 'Иван Иванов',
    username: 'ivan',
    city: 'Москва',
    church: 'ХАБ',
    reg: 'done',
  }))
  t.mock.method(TeamModel as any, 'find', async () => [])

  const { ctx, edits, replies } = callbackContext(111, 'support:profile:700')
  await showAdminUserCard(ctx, 700)

  assert.equal(edits.length, 0)
  assert.equal(replies.length, 1)
  assert.match(replies[0].text, /Иван Иванов/)
})

test('legacy ap callback in an existing audit message also opens a separate card', async (t) => {
  t.mock.method(UserModel as any, 'findOne', async () => ({
    telegramId: 700,
    fio: 'Иван Иванов',
    reg: 'done',
  }))
  t.mock.method(TeamModel as any, 'find', async () => [])

  const { ctx, edits, replies } = callbackContext(111, apCb('u', 700))
  ctx.chat.id = Number(process.env.SUPPORT_GROUP_ID)
  ctx.callbackQuery.message.message_thread_id = 390
  ctx.callbackQuery.message.reply_markup = {
    inline_keyboard: [[{ text: '👤 Пользователь', callback_data: apCb('u', 700) }]],
  }

  assert.equal(await handleAdminPanelCallback(ctx, ctx.callbackQuery.data), true)
  assert.equal(edits.length, 0)
  assert.equal(replies.length, 1)
})

test('private admin search edits its prompt and deletes the query without sending a result message', async (t) => {
  t.mock.method(TeamModel as any, 'find', () => ({ limit: async () => [{ _id: 'team-1', name: 'Спасение', members: [] }] }))
  const { ctx: prompt, edits, replies, } = callbackContext(111, apCb('search_t'))
  prompt.chat.type = 'private'
  await handleAdminPanelCallback(prompt, apCb('search_t'))
  assert.equal(prompt.session.adminPanelInput.sourceMessageId, 50)
  const { ctx, replies: results } = textContext(111, 'Спасение', prompt.session, edits)
  ctx.chat.type = 'private'
  const deleted: number[] = []
  ctx.deleteMessage = async () => { deleted.push(ctx.message.message_id) }
  await handleAdminPanelText(ctx)
  assert.deepEqual(deleted, [80])
  assert.equal(results.length, 0)
  assert.equal(replies.length, 0)
  assert.equal(edits.at(-1)?.messageId, 50)
  assert.equal(edits.at(-1)?.text, 'Найдено: 1')
  assert.equal(keyboardButtons(edits.at(-1)!)[0].callback_data, apCb('t', 'team-1'))
})

test('private admin validation errors edit the prompt and preserve retry state', async () => {
  const session = { adminPanelInput: { mode: 'assign_team_stream', teamId: 'team-1', sourceChatId: -900, sourceMessageId: 50 } }
  const edits: RecordedEdit[] = []
  const { ctx, replies } = textContext(111, 'invalid', session, edits)
  ctx.chat.type = 'private'
  ctx.deleteMessage = async () => true
  await handleAdminPanelText(ctx)
  assert.equal(replies.length, 0)
  assert.equal(edits[0].messageId, 50)
  assert.match(edits[0].text, /❌/)
  assert.equal(session.adminPanelInput.mode, 'assign_team_stream')
})

test('team devices show every flow, paginate, and return to the team', async (t) => {
  const { ProPresenterDeviceModel } = await import('../src/models/ProPresenterDevice.js')
  const { handleDeviceCallback } = await import('../src/handlers/proPresenterDevice.handlers.js')
  t.mock.method(TeamModel as any, 'findById', async () => ({ name: 'Спасение' }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', (filter: any) => {
    assert.deepEqual(filter, { teamId: 'team-1', status: 'active' })
    return { sort: async () => Array.from({ length: 21 }, (_, i) => ({ id: `device-${i}`, name: `PC-${i}`, flowNumber: i < 20 ? 10 : 11 })) }
  })
  const { ctx, edits } = callbackContext(111, 'dv:team_devices:team-1:1')
  await handleDeviceCallback(ctx, 'dv:team_devices:team-1:1')
  assert.match(edits[0].text, /Подтверждено: 21/)
  assert.match(edits[0].text, /PC-20 · поток №11/)
  assert.equal(keyboardButtons(edits[0]).at(-1)?.callback_data, apCb('t', 'team-1'))
  assert.ok(keyboardButtons(edits[0]).some(button => button.callback_data === 'dv:team_devices:team-1:0'))
  assert.ok(keyboardButtons(edits[0]).some(button => button.callback_data === 'dv:ad:device-20:t'))
  assert.ok(keyboardButtons(edits[0]).some(button => button.callback_data === 'dv:ta:team-1'))
})

test('admin add-device action has its own requested icon', async (t) => {
  const { ProPresenterDeviceModel } = await import('../src/models/ProPresenterDevice.js')
  const { ProPresenterStreamModel } = await import('../src/models/ProPresenterStream.js')
  const { handleDeviceCallback } = await import('../src/handlers/proPresenterDevice.handlers.js')
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ flowNumber: 10 }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(TeamModel as any, 'find', async () => [])
  const { ctx, edits } = callbackContext(111, 'dv:admin:10')
  await handleDeviceCallback(ctx, 'dv:admin:10')
  const button: any = keyboardButtons(edits[0]).find(item => item.text === 'Добавить устройство')
  assert.equal(button.icon_custom_emoji_id, '5397916757333654639')
  assert.equal(button.callback_data, 'dv:aa:10')
})


test('group admin search deletes the query and edits the existing prompt', async (t) => {
  t.mock.method(UserModel as any, 'find', () => ({ limit: async () => [{ telegramId: 456, fio: 'User' }] }))
  const { ctx: prompt, edits } = callbackContext(111, apCb('search_u'))
  await handleAdminPanelCallback(prompt, apCb('search_u'))
  const { ctx, replies } = textContext(111, '456', prompt.session, edits)
  let deleted = false
  ctx.deleteMessage = async () => { deleted = true }
  await handleAdminPanelText(ctx)
  assert.equal(deleted, true)
  assert.equal(replies.length, 0)
  assert.equal(edits.at(-1)?.messageId, 50)
  assert.equal(edits.at(-1)?.text, 'Найдено: 1')
})

test('flow device offers deletion; team device also offers replacement with user icons', async (t) => {
  const { ProPresenterDeviceModel } = await import('../src/models/ProPresenterDevice.js')
  const { handleDeviceCallback } = await import('../src/handlers/proPresenterDevice.handlers.js')
  t.mock.method(ProPresenterDeviceModel as any, 'findById', async () => ({ id: 'device-1', teamId: 'team-1', status: 'active', flowNumber: 10, name: 'PC', history: [] }))
  t.mock.method(TeamModel as any, 'findById', async () => ({ name: 'Team' }))
  for (const suffix of ['', ':t']) {
    const { ctx, edits } = callbackContext(111, `dv:ad:device-1${suffix}`)
    await handleDeviceCallback(ctx, `dv:ad:device-1${suffix}`)
    const buttons: any[] = keyboardButtons(edits[0])
    assert.equal(buttons.find(b => b.text === 'Удалить устройство').icon_custom_emoji_id, '5300821986451148615')
    assert.equal(buttons.some(b => b.text === 'Заменить устройство'), suffix === ':t')
    if (suffix) assert.equal(buttons.find(b => b.text === 'Заменить устройство').icon_custom_emoji_id, '5303174911269818848')
    assert.equal(buttons.some(b => b.text === 'Перенести'), false)
  }
})

test('admin replacement keeps the device, flow, and payment and records the old name', async (t) => {
  const { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } = await import('../src/models/ProPresenterDevice.js')
  const { ProPresenterRenewalSeatModel } = await import('../src/models/ProPresenterRenewal.js')
  const { adminReplaceDevice } = await import('../src/services/adminDevice.service.js')
  const id = '507f1f77bcf86cd799439011'
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => null)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => null)
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => ({ _id: id, name: 'Old', flowNumber: 10, updatedAt: new Date(0) }))
  t.mock.method(ProPresenterDeviceModel as any, 'findOneAndUpdate', async (filter: any, update: any) => {
    assert.equal(filter._id, id)
    assert.deepEqual(update.$set, { name: 'New' })
    assert.equal(update.$push.history.previousName, 'Old')
    assert.equal(update.$push.history.fromFlow, 10)
    return { id, name: 'New', flowNumber: 10 }
  })
  const result = await adminReplaceDevice({ deviceId: id, teamId: 'team-1', name: 'New', adminId: 111 })
  assert.equal(result?.flowNumber, 10)
})

test('admin device name validation edits its prompt and deletes invalid input in a group', async () => {
  const { handleDeviceNameText } = await import('../src/handlers/proPresenterDevice.handlers.js')
  const edits: RecordedEdit[] = []
  const session = { deviceDraft: { mode: 'admin_name', teamId: 'team-1', flowNumber: 10, adminMessageId: 50, returnToTeam: true } }
  const { ctx, replies } = textContext(111, 'x', session, edits)
  let deleted = false
  ctx.deleteMessage = async () => { deleted = true }
  assert.equal(await handleDeviceNameText(ctx), true)
  assert.equal(deleted, true)
  assert.equal(replies.length, 0)
  assert.equal(edits[0].messageId, 50)
  assert.match(edits[0].text, /от 2 до 80/)
  assert.equal(keyboardButtons(edits[0])[0].callback_data, 'dv:team_devices:team-1')
})
