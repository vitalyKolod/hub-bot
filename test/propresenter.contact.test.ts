import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import { ConversationModel } from '../src/models/Conversation.js'
import { ProPresenterWaitlistModel } from '../src/models/ProPresenterWaitlist.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { handlePropConfirmStream, handlePropNoStreamConfirm } from '../src/handlers/propresenter.handlers.js'

for (const kind of ['request', 'confirmation'] as const) {
  test(`ProPresenter ${kind} retains profile and business actions without creating conversation`, async (t) => {
    const teamId = '507f1f77bcf86cd799439011'
    t.mock.method(TeamModel as any, 'findById', async () => ({ name: 'Team', ownerId: 42, subscriptions: new Map() }))
    t.mock.method(UserModel as any, 'findOne', async () => ({ fio: 'User' }))
    t.mock.method(ConversationModel as any, 'findOneAndUpdate', () => { assert.fail('Must not create conversation') })
    t.mock.method(ProPresenterWaitlistModel as any, 'find', () => ({ sort: async () => [] }))
    t.mock.method(ProPresenterWaitlistModel as any, 'findOne', (filter: any) => filter.teamId ? null : ({ sort: async () => null }))
    t.mock.method(ProPresenterStreamModel as any, 'findOne', () => ({ sort: async () => null }))
    t.mock.method(ProPresenterWaitlistModel as any, 'countDocuments', async () => 1)
    t.mock.method(ProPresenterWaitlistModel as any, 'create', async (entry: any) => ({ ...entry, id: teamId, createdAt: new Date() }))
    const sent: any[] = []
    const ctx: any = {
      api: { sendMessage: async (...args: any[]) => sent.push(args) },
      editMessageCaption: async () => {}, answerCallbackQuery: async () => {},
    }
    if (kind === 'request') await handlePropNoStreamConfirm(ctx, 42, teamId)
    else await handlePropConfirmStream(ctx, 42, `12:${teamId}`)
    assert.equal(sent.length, 1)
    const buttons = sent[0][2].reply_markup.inline_keyboard.flat()
    assert.equal(buttons.some((button: any) => button.text === '💬 Написать пользователю' || button.callback_data?.startsWith('cv:')), false)
    assert.ok(buttons.some((button: any) => button.url === 'tg://user?id=42'))
    if (kind === 'confirmation') {
      assert.ok(buttons.some((button: any) => button.text === '✅ Подтвердить'))
      assert.ok(buttons.some((button: any) => button.text === '❌ Отклонить'))
    }
  })
}
