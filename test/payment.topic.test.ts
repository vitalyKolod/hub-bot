import assert from 'node:assert/strict'
import test from 'node:test'
import { handleReceiptUpload } from '../src/handlers/payment.handlers.js'
import { UserModel } from '../src/models/User.js'
import { TeamModel } from '../src/models/Team.js'
import { PaymentModel } from '../src/models/Payment.js'
import { CartModel } from '../src/models/Cart.js'
import { auditLogService } from '../src/services/auditLog.service.js'

const teamId = '507f1f77bcf86cd799439011'
function context(kind: 'photo' | 'document', product = 'propresenter') {
  const replies: string[] = []
  const deliveries: any[] = []
  const ctx: any = {
    from: { id: 10, username: 'owner' },
    session: { waitingForReceipt: true, payment: { product, teamId, method: 'rub' } },
    message: kind === 'photo' ? { photo: [{ file_id: 'receipt' }] } : { document: { file_id: 'receipt' } },
    api: {
      createForumTopic: async () => ({ message_thread_id: 88 }),
      sendPhoto: async (...args: any[]) => { deliveries.push(args); return { message_id: 99 } },
      sendDocument: async (...args: any[]) => { deliveries.push(args); return { message_id: 99 } },
    },
    reply: async (text: string) => { replies.push(text) },
    react: async () => {},
  }
  return { ctx, replies, deliveries }
}
function mockProfile(t: any) {
  t.mock.method(UserModel, 'findOne', async () => ({ fio: 'Owner' }))
  t.mock.method(TeamModel, 'findById', async () => ({ name: 'Team', subscriptions: new Map([
    ['propresenter', { status: 'active', expiresAt: new Date('2099-01-01') }],
  ]) }))
  t.mock.method(console, 'error', () => {})
}
for (const kind of ['photo', 'document'] as const) {
  for (const product of ['propresenter', 'cart']) {
    test(`${kind} ${product}: topic failure never delivers to registration or changes payment/cart`, async (t) => {
      mockProfile(t)
      const { ctx, replies, deliveries } = context(kind, product)
      const item = { product: 'propresenter', status: 'pending' }
      let saves = 0
      t.mock.method(CartModel, 'findOne', async () => ({ items: [item], save: async () => { saves++ } }))
      const paymentWrite = t.mock.method(PaymentModel, 'findOneAndUpdate', async () => { throw new Error('unexpected payment write') })
      ctx.api.createForumTopic = async () => { throw new Error('Too Many Requests: retry after 15') }
      await handleReceiptUpload(ctx)
      assert.equal(deliveries.length, 0)
      assert.equal(paymentWrite.mock.callCount(), 0)
      assert.equal(saves, 0)
      assert.equal(item.status, 'pending')
      assert.equal(ctx.session.waitingForReceipt, true)
      assert.match(replies.at(-1)!, /Чек не отправлен/)
    })
  }
  test(`${kind}: success explicitly routes receipt and stores its topic`, async (t) => {
    mockProfile(t)
    const { ctx, replies, deliveries } = context(kind)
    let topicCreated = false
    ctx.api.createForumTopic = async (_group: number, title: string) => {
      assert.equal(title, 'Продление — @owner')
      topicCreated = true
      return { message_thread_id: 88 }
    }
    t.mock.method(PaymentModel, 'findOneAndUpdate', async () => {
      assert.equal(topicCreated, true)
      return { id: teamId }
    })
    const location = t.mock.method(PaymentModel, 'findByIdAndUpdate', async () => ({}))
    t.mock.method(auditLogService, 'createLog', async () => ({}))
    await handleReceiptUpload(ctx)
    assert.equal(deliveries.length, 1)
    assert.equal(deliveries[0][2].message_thread_id, 88)
    assert.equal((location.mock.calls[0].arguments[1] as any).telegramAdminThreadId, 88)
    assert.equal(ctx.session.waitingForReceipt, false)
    assert.match(replies.at(-1)!, /Чек успешно отправлен/)
  })
}
test('invalid topic ID is rejected without sending a receipt', async (t) => {
  mockProfile(t)
  const { ctx, deliveries } = context('photo')
  ctx.api.createForumTopic = async () => ({ message_thread_id: undefined })
  await handleReceiptUpload(ctx)
  assert.equal(deliveries.length, 0)
  assert.equal(ctx.session.waitingForReceipt, true)
})

test('flow 8 device renewal preserves its topic title and remains payable after a network failure', async (t) => {
  mockProfile(t)
  const { ProPresenterRenewalCampaignModel, ProPresenterRenewalSeatModel } = await import('../src/models/ProPresenterRenewal.js')
  const { ProPresenterDeviceModel } = await import('../src/models/ProPresenterDevice.js')
  const campaignId = '507f1f77bcf86cd799439012'
  const deviceId = '507f1f77bcf86cd799439013'
  const team = { _id: teamId, name: 'Преображение · Вологда', ownerId: 10, subscriptions: new Map() }
  const seat: any = {
    teamId, teamName: team.name, ownerId: 10, paymentStatus: 'none',
    devices: [{ deviceId, name: 'PC', active: true, vote: 'yes', paymentStatus: 'none' }],
    save: async () => {},
  }
  t.mock.method(ProPresenterRenewalCampaignModel, 'findById', async () => ({
    _id: campaignId, id: campaignId, flowNumber: 8, status: 'active', billingMode: 'device',
    cycleEndsAt: new Date('2026-10-01'), targetEndsAt: new Date('2027-10-01'),
  }))
  t.mock.method(TeamModel, 'find', async () => [team])
  t.mock.method(ProPresenterDeviceModel, 'find', async () => [{ id: deviceId, teamId, name: 'PC' }])
  t.mock.method(ProPresenterRenewalSeatModel, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel, 'find', async () => [seat])
  t.mock.method(ProPresenterRenewalSeatModel, 'updateMany', async () => ({}))
  const payments = t.mock.method(PaymentModel, 'findOneAndUpdate', async () => { throw new Error('unexpected payment write') })
  const { ctx, deliveries, replies } = context('photo')
  ctx.session.payment.renewalCampaignId = campaignId
  ctx.session.payment.renewalDeviceIds = [deviceId]
  let title = ''
  ctx.api.createForumTopic = async (_group: number, name: string) => {
    title = name
    throw new Error('connect ETIMEDOUT')
  }
  await handleReceiptUpload(ctx)
  assert.match(title, /Продление ProPresenter · поток №8 · 1 устройств/)
  assert.equal(deliveries.length, 0)
  assert.equal(payments.mock.callCount(), 0)
  assert.equal(seat.paymentStatus, 'none')
  assert.equal(ctx.session.waitingForReceipt, true)
  assert.match(replies.at(-1)!, /Чек не отправлен/)
})
