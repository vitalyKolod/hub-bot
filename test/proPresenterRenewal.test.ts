import assert from 'node:assert/strict'
import test from 'node:test'
import { PaymentModel } from '../src/models/Payment.js'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterRenewalCampaignModel, ProPresenterRenewalSeatModel } from '../src/models/ProPresenterRenewal.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { GroupAccessRevocationModel } from '../src/models/GroupAccessRevocation.js'
import { AuditLogModel } from '../src/models/AuditLog.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'
import { acceptPayment, createPayment } from '../src/services/payment.service.js'
import { eligibleSeats, renewalStats, renewalPollKeyboard, renewalListsText, voteForDevice, declineTeamDevices, reconcileRenewalDevices } from '../src/services/proPresenterRenewal.service.js'
import { runReminders } from '../src/services/reminder.service.js'
import { sendDeviceChoices } from '../src/handlers/proPresenterRenewal.handlers.js'

const campaignId = '507f1f77bcf86cd799439012'

test('the stream poll starts with yes and no', () => {
  const buttons = renewalPollKeyboard(campaignId).inline_keyboard.flat()
  assert.deepEqual(buttons.map((button) => button.text), ['👍 Да, буду продлевать', '👎 Нет, не буду'])
  assert.ok(buttons.every((button) => 'callback_data' in button))
})

test('lists view keeps payment and vote details in one message', () => {
  const text = renewalListsText({ flowNumber: 2 }, [
    { teamName: 'Команда А', ownerId: 10, vote: 'yes', paymentStatus: 'paid' },
    { teamName: 'Команда Б', ownerId: 11, vote: 'no', paymentStatus: 'none' },
  ])
  assert.match(text, /Поток №2 · списки/)
  assert.match(text, /Оплачено:\n• Команда А · ID 10/)
  assert.match(text, /Не продлевают:\n• Команда Б · ID 11/)
})

test('accepted ProPresenter contribution marks one seat paid without extending the team subscription', async (t) => {
  const payment: any = {
    id: '507f1f77bcf86cd799439011', userId: 10, teamId: 'team-1',
    productId: 'propresenter', renewalCampaignId: campaignId,
    paymentMethod: 'Рубли — СБП', operation: 'renewal', status: 'processing',
    async save() { return this },
  }
  let teamSaves = 0
  const team: any = {
    _id: 'team-1', name: 'Команда', ownerId: 10,
    subscriptions: new Map([['propresenter', { status: 'active', meta: { flowNumber: 2 } }]]),
    async save() { teamSaves++ },
  }
  const seat: any = { paymentStatus: 'none', paymentId: null, paidAt: null, async save() { return this } }
  t.mock.method(PaymentModel as any, 'findOneAndUpdate', async () => payment)
  t.mock.method(TeamModel as any, 'findById', async () => team)
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({ status: 'active', flowNumber: 2 }))
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)

  const result = await acceptPayment(payment.id, 99)

  assert.equal(result.applied, true)
  assert.equal(payment.status, 'accepted')
  assert.equal(seat.paymentStatus, 'paid')
  assert.equal(teamSaves, 0)
})

test('one seat appears in exactly one renewal category even after paying without a vote', () => {
  assert.deepEqual(renewalStats([
    { vote: 'yes', paymentStatus: 'paid' },
    { vote: 'none', paymentStatus: 'paid' },
    { vote: 'yes', paymentStatus: 'pending' },
    { vote: 'no', paymentStatus: 'none' },
    { vote: 'none', paymentStatus: 'none' },
  ]), { total: 5, paid: 2, yes: 0, no: 1, silent: 1, pending: 1 })
})

test('renewal statistics count devices, including several devices in one team', () => {
  assert.deepEqual(renewalStats([
    { vote: 'yes', paymentStatus: 'pending', devices: [
      { vote: 'none', paymentStatus: 'paid' }, { vote: 'yes', paymentStatus: 'pending' }, { vote: 'yes', paymentStatus: 'none' },
    ] },
    { vote: 'no', paymentStatus: 'none', devices: [{ vote: 'no', paymentStatus: 'none' }] },
  ]), { total: 4, paid: 1, yes: 1, no: 1, silent: 0, pending: 1 })
})

test('one team can decline one device and renew another without charging the declined device', async (t) => {
  const teamId = '507f1f77bcf86cd799439020'
  const first = '507f1f77bcf86cd799439021'
  const second = '507f1f77bcf86cd799439022'
  const team: any = { _id: teamId, ownerId: 10, name: 'Команда', subscriptions: new Map() }
  const devices = [first, second].map((id) => ({ id, name: id === first ? 'Mac mini' : 'Laptop', teamId, flowNumber: 2, paidThrough: null }))
  const seat: any = { teamId, ownerId: 10, teamName: 'Команда', paymentStatus: 'none',
    devices: devices.map((device) => ({ deviceId: device.id, name: device.name, active: true, vote: 'none', paymentStatus: 'none' })), async save() { return this } }
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({
    id: campaignId, _id: campaignId, status: 'active', billingMode: 'device', flowNumber: 2,
    cycleEndsAt: new Date('2027-01-01'), startedAt: new Date('2026-01-01'), priceRub: 4000, priceUsd: 40,
  }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', async () => devices)
  t.mock.method(TeamModel as any, 'find', async () => [team])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'find', async () => [seat])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'updateMany', async () => ({}))
  t.mock.method(PaymentModel as any, 'findOne', async () => null)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => false)
  t.mock.method(PaymentModel as any, 'findOneAndUpdate', async (_filter: any, update: any) => update.$setOnInsert)
  const api: any = {}

  await voteForDevice(api, campaignId, first, 10, 'yes')
  await voteForDevice(api, campaignId, second, 10, 'no')
  await voteForDevice(api, campaignId, first, 10, 'toggle')
  assert.equal(seat.devices[0].vote, 'none')
  await voteForDevice(api, campaignId, first, 10, 'toggle')
  assert.equal(seat.devices[0].vote, 'yes')
  assert.deepEqual(renewalStats([seat]), { total: 2, paid: 0, yes: 1, no: 1, silent: 0, pending: 0 })
  const payment = await createPayment({ userId: 10, teamId, productId: 'propresenter', currency: 'rub',
    paymentMethod: 'СБП', operation: 'renewal', receipt: { type: 'photo', telegramFileId: 'file' },
    renewalCampaignId: campaignId, renewalDeviceIds: [first] })
  assert.equal(payment.amount, 4000)
  await assert.rejects(createPayment({ userId: 10, teamId, productId: 'propresenter', currency: 'rub',
    paymentMethod: 'СБП', operation: 'renewal', receipt: { type: 'photo', telegramFileId: 'file' },
    renewalCampaignId: campaignId, renewalDeviceIds: [second] }), /изменился/)
})

test('a no response in the stream marks every unpaid device no, leaving paid devices intact', async (t) => {
  const teamId = '507f1f77bcf86cd799439020'
  const devices = ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'].map((id) => ({ id, name: id, teamId, flowNumber: 2, paidThrough: null }))
  const seat: any = { teamId, ownerId: 10, teamName: 'Команда', paymentStatus: 'none',
    devices: [
      { deviceId: devices[0].id, vote: 'yes', paymentStatus: 'none', active: true },
      { deviceId: devices[1].id, vote: 'none', paymentStatus: 'paid', active: true },
    ], async save() { return this } }
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({ id: campaignId, _id: campaignId,
    status: 'active', billingMode: 'device', flowNumber: 2, cycleEndsAt: new Date('2027-01-01') }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', async () => devices)
  t.mock.method(TeamModel as any, 'find', async () => [{ _id: teamId, ownerId: 10, name: 'Команда', subscriptions: new Map() }])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'find', async () => [seat])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'updateMany', async () => ({}))

  await declineTeamDevices({} as any, campaignId, teamId, 10)
  assert.equal(seat.devices[0].vote, 'no')
  assert.equal(seat.devices[1].vote, 'none')
  assert.equal(seat.devices[1].paymentStatus, 'paid')
})

test('device picker edits one private message and shows gray or green checkboxes', async (t) => {
  const teamId = '507f1f77bcf86cd799439020'
  const devices = ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'].map((id, index) => ({ id, name: index ? 'Laptop' : 'Mac', teamId, flowNumber: 2 }))
  const seat: any = { teamId, ownerId: 10, teamName: 'Команда', paymentStatus: 'none', devices: [
    { deviceId: devices[0].id, name: 'Mac', vote: 'none', paymentStatus: 'none', active: true },
    { deviceId: devices[1].id, name: 'Laptop', vote: 'yes', paymentStatus: 'none', active: true },
  ], async save() { return this } }
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({ id: campaignId, _id: campaignId,
    status: 'active', billingMode: 'device', flowNumber: 2, priceRub: 4000, priceUsd: 40, cycleEndsAt: new Date('2027-01-01') }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', async () => devices)
  t.mock.method(TeamModel as any, 'find', async () => [{ _id: teamId, ownerId: 10, name: 'Команда', subscriptions: new Map() }])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'find', async () => [seat])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'updateMany', async () => ({}))
  let edited: any
  const api: any = { async editMessageText(_chat: number, _message: number, text: string, options: any) { edited = { text, options } } }

  await sendDeviceChoices(api, 10, campaignId, teamId, 123)
  const buttons = edited.options.reply_markup.inline_keyboard.flat()
  assert.deepEqual(buttons.map((button: any) => button.text), ['☑️ Mac', '✅ Laptop', '💳 Оплатить 1 устр.'])
  assert.match(edited.text, /К оплате: 1 × 4000 ₽/)
})

test('released devices keep their historical answer but leave the active statistics', async (t) => {
  const teamId = '507f1f77bcf86cd799439020'
  const activeId = '507f1f77bcf86cd799439021'
  const releasedId = '507f1f77bcf86cd799439022'
  const seat: any = { devices: [
    { deviceId: activeId, name: 'Mac', vote: 'yes', paymentStatus: 'none' },
    { deviceId: releasedId, name: 'Old PC', vote: 'no', paymentStatus: 'none' },
  ], async save() { return this } }
  t.mock.method(ProPresenterDeviceModel as any, 'find', async () => [{ id: activeId, name: 'Mac', teamId, flowNumber: 2, paidThrough: null }])
  t.mock.method(TeamModel as any, 'find', async () => [{ _id: teamId, name: 'Команда', ownerId: 10 }])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'updateMany', async () => ({}))

  await reconcileRenewalDevices({ _id: campaignId, billingMode: 'device', flowNumber: 2, cycleEndsAt: new Date('2027-01-01') })
  assert.equal(seat.devices.find((device: any) => device.deviceId === releasedId).active, false)
  assert.deepEqual(renewalStats([seat]), { total: 1, paid: 0, yes: 1, no: 0, silent: 0, pending: 0 })
})

test('one receipt for three confirmed devices charges three device prices', async (t) => {
  const deviceIds = ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022', '507f1f77bcf86cd799439023']
  const devices = deviceIds.map((id) => ({ id, name: `Device ${id.at(-1)}`, teamId: '507f1f77bcf86cd799439020', flowNumber: 2, paidThrough: null }))
  const team: any = { _id: '507f1f77bcf86cd799439020', ownerId: 10, name: 'Команда', subscriptions: new Map() }
  const seat: any = { teamId: String(team._id), ownerId: 10, teamName: 'Команда', paymentStatus: 'none',
    devices: devices.map((device) => ({ deviceId: device.id, name: device.name, vote: 'yes', paymentStatus: 'none' })), async save() { return this } }
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({
    id: campaignId, _id: campaignId, status: 'active', billingMode: 'device', flowNumber: 2,
    cycleEndsAt: new Date('2027-01-01'), startedAt: new Date('2026-01-01'), priceRub: 4000, priceUsd: 40,
  }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', async () => devices)
  t.mock.method(TeamModel as any, 'find', async () => [team])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'findOne', async () => seat)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'find', async () => [seat])
  t.mock.method(ProPresenterRenewalSeatModel as any, 'updateMany', async () => ({}))
  t.mock.method(PaymentModel as any, 'findOne', async () => null)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => false)
  let saved: any
  t.mock.method(PaymentModel as any, 'findOneAndUpdate', async (_filter: any, update: any) => { saved = update.$setOnInsert; return saved })

  await createPayment({ userId: 10, teamId: String(team._id), productId: 'propresenter', currency: 'usd',
    paymentMethod: 'USDT', operation: 'renewal', receipt: { type: 'photo', telegramFileId: 'file' },
    renewalCampaignId: campaignId, renewalDeviceIds: deviceIds })

  assert.equal(saved.amount, 120)
  assert.deepEqual(saved.renewalDeviceIds, deviceIds)
})

test('a volunteer in the team cannot take the owner’s renewal seat', async (t) => {
  const seat: any = { teamId: '507f1f77bcf86cd799439013', teamName: 'Команда', ownerId: 10, async save() {} }
  const team: any = {
    _id: seat.teamId, name: 'Команда', ownerId: 10,
    members: [{ telegramId: 11, role: 'member', status: 'active' }],
    subscriptions: new Map([['propresenter', { status: 'active', meta: { flowNumber: 2 } }]]),
  }
  t.mock.method(ProPresenterRenewalCampaignModel as any, 'findById', async () => ({ _id: campaignId, status: 'active', flowNumber: 2 }))
  t.mock.method(ProPresenterRenewalSeatModel as any, 'find', async () => [seat])
  t.mock.method(TeamModel as any, 'find', async (filter: any) => filter.ownerId === 10 ? [team] : [])

  assert.deepEqual(await eligibleSeats(campaignId, 11), [])
  assert.equal((await eligibleSeats(campaignId, 10)).length, 1)
})

test('expired ProPresenter stream does not remove members from its chat during renewal', async (t) => {
  const team: any = {
    _id: 'team-1', name: 'Команда', ownerId: 10,
    members: [{ telegramId: 10, status: 'active' }], reminders: [],
    subscriptions: new Map([['propresenter', {
      status: 'expired', expiresAt: new Date(0), meta: { flowNumber: 2 },
    }]]),
    async save() {},
  }
  let bans = 0
  let tasks = 0
  t.mock.method(TeamModel as any, 'find', async () => [team])
  t.mock.method(ProPresenterStreamModel as any, 'find', async () => [
    { flowNumber: 2, chatId: -1001234567890, expiresAt: new Date(0) },
  ])
  t.mock.method(GroupAccessRevocationModel as any, 'find', async () => [])
  t.mock.method(GroupAccessRevocationModel as any, 'findOneAndUpdate', async () => { tasks++; return null })
  const bot: any = { api: { async banChatMember() { bans++ }, async sendMessage() {} } }

  await runReminders(bot)

  assert.equal(tasks, 0)
  assert.equal(bans, 0)
})
