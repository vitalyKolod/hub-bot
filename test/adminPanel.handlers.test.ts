import assert from 'node:assert/strict'
import test from 'node:test'

import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import { apCb } from '../src/constants/admin-panel.js'

process.env.ADMIN_IDS = '111,222'
process.env.ADMIN_GROUP_ID ||= '-100000000001'
process.env.CONTENT_GROUP_ID ||= '-100000000002'
process.env.SUPPORT_GROUP_ID ||= '-100000000003'
process.env.SUNDAY_SCREENS_GROUP_ID ||= '-100000000004'
process.env.PROP_WAITLIST_THREAD_ID ||= '10'
process.env.PROP_STREAM_VERIFY_THREAD_ID ||= '11'

const { handleAdminPanelCallback, handleAdminPanelText } = await import(
  '../src/handlers/adminPanel.handlers.js'
)

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
  assert.equal(buttons.find((button) => button.text === '✉️ Написать юзеру')?.url, `tg://user?id=${targetId}`)
  assert.ok(labels.indexOf('👥 Спасение') < labels.indexOf('➕ Создать команду'))
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
  assert.match(replies[0].text, /не может быть пустым/)
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
