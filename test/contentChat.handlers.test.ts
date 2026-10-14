import test from 'node:test'
import assert from 'node:assert/strict'
import { handleContentChat } from '../src/handlers/contentChat.handlers.js'
import { TeamModel } from '../src/models/Team.js'
import { GroupAccessRevocationModel } from '../src/models/GroupAccessRevocation.js'
import { getProduct } from '../src/config/products.js'

const teamId = '507f1f77bcf86cd799439010'
const parsed = { a: 'content_chat' as const, p: teamId, m: 'cmg' }
function setup(t: any) {
  const team = {
    ownerId: 10, members: [{ telegramId: 20, status: 'active' }],
    subscriptions: new Map([['cmg', { status: 'active', expiresAt: new Date(Date.now() + 86_400_000) }]]),
  }
  t.mock.method(TeamModel, 'findById', async () => team)
  t.mock.method(TeamModel, 'find', async () => [team])
  t.mock.method(GroupAccessRevocationModel, 'findOne', async () => null)
  const product = getProduct('cmg')!
  const oldGroupId = product.groupId
  product.groupId = -1009876543210
  t.after(() => { product.groupId = oldGroupId })
  const replies: any[] = [], answers: any[] = [], invites: any[] = []
  const ctx: any = {
    answerCallbackQuery: async (answer: any) => { answers.push(answer) },
    reply: async (text: string, options: any) => { replies.push({ text, options }) },
    api: {
      createChatInviteLink: async (chatId: number, options: any) => {
        invites.push({ chatId, options })
        return { invite_link: `https://t.me/+fresh${invites.length}` }
      },
      unbanChatMember: async () => {},
    },
  }
  return { team, ctx, replies, answers, invites }
}

test('owner and active member can obtain fresh protected CMG invitations repeatedly', async (t) => {
  const { ctx, replies, invites } = setup(t)
  for (const userId of [10, 20, 10]) await handleContentChat(ctx, userId, parsed)
  assert.equal(invites.length, 3)
  for (const invite of invites) {
    assert.equal(invite.chatId, -1009876543210)
    assert.equal(invite.options.creates_join_request, true)
    assert.ok(invite.options.expire_date > Date.now() / 1000)
  }
  assert.equal(replies[2].options.reply_markup.inline_keyboard[0][0].url, 'https://t.me/+fresh3')
})

for (const reason of ['outsider', 'pending member', 'expired', 'unpaid']) {
  test(`chat callback denies ${reason} even when an old button is available`, async (t) => {
    const { team, ctx, replies, answers, invites } = setup(t)
    let userId = reason === 'outsider' ? 999 : 20
    if (reason === 'pending member') team.members[0].status = 'pending'
    if (reason === 'expired') team.subscriptions.get('cmg')!.expiresAt = new Date(0)
    if (reason === 'unpaid') team.subscriptions.get('cmg')!.status = 'pending'
    await handleContentChat(ctx, userId, parsed)
    assert.equal(invites.length, 0)
    assert.equal(replies.length, 0)
    assert.equal(answers[0].show_alert, true)
  })
}

test('missing chat configuration and Telegram failures produce actionable feedback', async (t) => {
  const { ctx, replies, answers, invites } = setup(t)
  getProduct('cmg')!.groupId = undefined
  await handleContentChat(ctx, 10, parsed)
  assert.match(answers[0].text, /не настроен/)
  assert.equal(invites.length, 0)
  getProduct('cmg')!.groupId = -1009876543210
  ctx.api.createChatInviteLink = async () => { throw new Error('Telegram unavailable') }
  t.mock.method(console, 'error', () => {})
  await handleContentChat(ctx, 10, parsed)
  assert.match(replies[0].text, /Попробуйте ещё раз/)
})

test('callback rejects malformed teams and products outside content subscriptions', async (t) => {
  const { ctx, invites, answers } = setup(t)
  await handleContentChat(ctx, 10, { ...parsed, p: 'invalid' })
  await handleContentChat(ctx, 10, { ...parsed, m: 'propresenter' })
  assert.equal(invites.length, 0)
  assert.ok(answers.every(answer => answer.show_alert))
})
