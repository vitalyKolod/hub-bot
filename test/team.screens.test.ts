import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import { PaymentModel } from '../src/models/Payment.js'
import { TeamInviteModel } from '../src/models/TeamInvite.js'
import { ProPresenterDeviceModel } from '../src/models/ProPresenterDevice.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { parseCb } from '../src/core/callback.js'
import { teamScreen, teamProPresenterScreen, teamContentScreen, teamMembersScreen } from '../src/screens/team.js'
import { validateInvite } from '../src/services/teamInvite.service.js'
import { getProduct } from '../src/config/products.js'

const teamId = '507f1f77bcf86cd799439010'
function setup(t: any, members = 1) {
  const team = {
    name: 'ХАБ', ownerId: 10,
    members: Array.from({ length: members }, (_, index) => ({ telegramId: 10 + index, role: index ? 'member' : 'owner', status: 'active' })),
    subscriptions: new Map<string, any>([
      ['propresenter', { status: 'active', expiresAt: new Date(Date.now() + 30 * 86_400_000), meta: { flowNumber: 2, chatLink: 'https://t.me/stream' } }],
      ['procontent', { status: 'active', expiresAt: new Date(Date.now() + 20 * 86_400_000) }],
    ]),
  }
  t.mock.method(TeamModel as any, 'findById', async () => team)
  t.mock.method(UserModel as any, 'findOne', async () => ({ telegramId: 10, fio: 'Владелец' }))
  t.mock.method(UserModel as any, 'find', async () => team.members.map((member: any) => ({ telegramId: member.telegramId, fio: `Участник ${member.telegramId}`, username: `user${member.telegramId}` })))
  t.mock.method(PaymentModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [{ name: 'Mac', flowNumber: 2 }] }))
  t.mock.method(ProPresenterStreamModel as any, 'find', async () => [{ flowNumber: 2, email: 'stream@example.com', password: 'secret-pass', chatLink: 'https://t.me/stream', expiresAt: new Date(Date.now() + 30 * 86_400_000) }])
  return team
}
function buttons(screen: any) { return screen.keyboard.inline_keyboard.flat() }

test('team overview is compact and routes to three detailed screens', async (t) => {
  setup(t)
  const screen = await teamScreen(10, teamId)
  assert.ok(screen.caption.length < 1024)
  const quotes = screen.caption_entities?.filter((entity: any) => entity.type === 'expandable_blockquote') || []
  assert.equal(quotes.length, 2)
  const contentQuote = screen.caption.slice(quotes[1].offset, quotes[1].offset + quotes[1].length)
  assert.match(contentQuote, /Контент для экранов\n\nПодписок 1\/5\n/)
  assert.ok(contentQuote.indexOf('Подписок 1/5') < contentQuote.indexOf('ProContent'))
  assert.deepEqual(buttons(screen).slice(0, 3).map((button: any) => parseCb(button.callback_data)?.s), ['team_propresenter', 'team_content', 'team_members'])
  assert.ok(!buttons(screen).some((button: any) => button.text?.startsWith('Чат')))
})

test('ProPresenter and content details keep chats and purchases in their own screens', async (t) => {
  setup(t)
  const product = getProduct('procontent')!
  const oldGroupId = product.groupId
  product.groupId = -1001234567890
  t.after(() => { product.groupId = oldGroupId })
  const prop = await teamProPresenterScreen(10, teamId)
  const content = await teamContentScreen(10, teamId, { api: {
    getChatMember: async () => ({ status: 'member' }),
    getChat: async () => ({ username: 'procontent_chat' }),
  } })
  assert.equal(prop.photo, './public/team-propresenter.png')
  assert.equal(content.photo, './public/team-content.png')
  assert.match(content.caption, /Контент для экранов\n\nПодписок 1\/5\n/)
  assert.ok(content.caption.indexOf('Подписок 1/5') < content.caption.indexOf('ProContent'))
  assert.ok(buttons(prop).some((button: any) => button.text === 'УСТРОЙСТВА'))
  assert.ok(buttons(prop).some((button: any) => button.text === 'Чат потока №2'))
  assert.match(prop.caption, /Логин: stream@example.com/)
  assert.match(prop.caption, /Пароль: secret-pass/)
  assert.match(prop.caption, /До: \d{2}\.\d{2}\.\d{4}/)
  assert.ok(prop.caption_entities?.some((entity: any) => entity.type === 'spoiler'))
  assert.ok(buttons(content).some((button: any) => button.text === 'ДОБАВИТЬ ПОДПИСКУ'))
  assert.equal(buttons(content).find((button: any) => button.text === 'Чат — ProContent')?.url, 'https://t.me/procontent_chat')
  assert.match(content.caption, /❌ Нет/)
  assert.ok(buttons(prop).some((button: any) => button.text === '◀️ НАЗАД'))
  assert.ok(buttons(content).some((button: any) => button.text === '◀️ НАЗАД'))
})

test('content chat button is hidden when user is not in the Telegram chat', async (t) => {
  setup(t)
  const product = getProduct('procontent')!
  const oldGroupId = product.groupId
  product.groupId = -1001234567890
  t.after(() => { product.groupId = oldGroupId })
  const screen = await teamContentScreen(10, teamId, { api: {
    getChatMember: async () => ({ status: 'left' }),
    getChat: async () => { throw new Error('Should not fetch chat') },
  } })
  assert.ok(!buttons(screen).some((button: any) => button.text === 'Чат — ProContent'))
})

test('ProPresenter credentials are restricted to team members', async (t) => {
  setup(t)
  await assert.rejects(() => teamProPresenterScreen(999, teamId), /только участникам команды/)
})

test('member details page through more than five people without a membership cap', async (t) => {
  setup(t, 11)
  const first = await teamMembersScreen(10, teamId)
  const nextButton = buttons(first).find((button: any) => button.text === 'Следующие ▶️')
  assert.equal(parseCb(nextButton.callback_data)?.p, `${teamId}:1`)
  assert.match(first.caption, /Участников: 11/)
  assert.ok(buttons(first).some((button: any) => button.text === 'ДОБАВИТЬ УЧАСТНИКА'))
  const last = await teamMembersScreen(10, `${teamId}:2`)
  assert.ok(last.caption.length < 1024)
  assert.ok(buttons(last).some((button: any) => button.text === '◀️ Предыдущие'))
})

test('a paid invite remains valid when the team already has five members', async (t) => {
  const team = setup(t, 5)
  t.mock.method(TeamInviteModel as any, 'findOne', async () => ({ status: 'active', teamId }))
  const check = await validateInvite('paid-code')
  assert.equal(check.ok, true)
  assert.equal(check.team, team)
})
