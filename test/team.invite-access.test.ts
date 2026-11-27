import assert from 'node:assert/strict'
import test from 'node:test'
import { handleAcceptTeamInvite } from '../src/handlers/team.hadler.js'
import { registerScreens } from '../src/core/render.js'
import { mainScreen } from '../src/screens/main.js'
import { TeamInviteModel } from '../src/models/TeamInvite.js'
import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import { auditLogService } from '../src/services/auditLog.service.js'
import { getProduct } from '../src/config/products.js'
import { parseCb } from '../src/core/callback.js'

test('new team member receives chat entry buttons after consuming the paid invite', async (t) => {
  registerScreens({ main: mainScreen } as any)
  const teamId = '507f1f77bcf86cd799439010'
  const team: any = {
    _id: { toString: () => teamId }, name: 'Команда', ownerId: 10,
    members: [{ telegramId: 10, status: 'active' }],
    subscriptions: new Map([
      ['cmg', { status: 'active', expiresAt: new Date(Date.now() + 86_400_000) }],
      ['storyloops', { status: 'expired', expiresAt: new Date(0) }],
    ]),
    async save() {},
  }
  const invite = { code: 'paid-code', status: 'active', teamId }
  t.mock.method(TeamInviteModel, 'findOne', async () => invite)
  t.mock.method(TeamInviteModel, 'findOneAndUpdate', async () => invite)
  t.mock.method(TeamModel, 'findById', async () => team)
  t.mock.method(UserModel, 'updateOne', async () => ({}))
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 20, fio: 'Волонтёр' }))
  t.mock.method(auditLogService, 'createLog', async () => ({}))
  const product = getProduct('cmg')!
  const oldGroupId = product.groupId
  product.groupId = -1009876543210
  t.after(() => { product.groupId = oldGroupId })

  const replies: any[] = []
  const ownerMessages: any[] = []
  const ctx: any = {
    api: { sendMessage: async (...args: any[]) => { ownerMessages.push(args) } },
    answerCallbackQuery: async () => {},
    replyWithPhoto: async () => ({ message_id: 123 }),
    reply: async (message: string, options: any) => { replies.push({ message, options }) },
  }
  await handleAcceptTeamInvite(ctx, 20, 'paid-code')

  assert.equal(team.members.find((member: any) => member.telegramId === 20)?.status, 'active')
  assert.equal(ownerMessages[0][0], 10)
  assert.equal(replies.length, 1)
  const buttons = replies[0].options.reply_markup.inline_keyboard.flat()
  assert.deepEqual(buttons.map((button: any) => parseCb(button.callback_data)?.m), ['cmg'])
  assert.equal(parseCb(buttons[0].callback_data)?.p, teamId)
})
