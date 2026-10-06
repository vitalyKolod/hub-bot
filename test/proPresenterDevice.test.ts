import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { ProPresenterRenewalSeatModel } from '../src/models/ProPresenterRenewal.js'
import { applyDeviceChange, createDeviceRequest, decideDeviceRequest } from '../src/services/proPresenterDevice.service.js'

const teamId = '507f1f77bcf86cd799439010'
const deviceId = '507f1f77bcf86cd799439011'

test('only the team owner may request an additional device', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, subscriptions: new Map([['propresenter', { status: 'active' }]]) }))
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ status: 'active', flowNumber: 2 }))
  let created = false
  t.mock.method(ProPresenterDeviceRequestModel as any, 'create', async () => { created = true })

  await assert.rejects(createDeviceRequest({ action: 'add', teamId, requesterId: 11, deviceName: 'MacBook', toFlow: 2 }), /только владелец/)
  assert.equal(created, false)
})

test('device cannot be transferred into its current flow', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10 }))
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => ({ name: 'MacBook', flowNumber: 2, status: 'active' }))
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => false)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => false)
  await assert.rejects(createDeviceRequest({ action: 'move', teamId, requesterId: 10, deviceId, toFlow: 2 }), /уже находится/)
})

test('replacement request records the old device and keeps the device count unchanged until approval', async (t) => {
  const old: any = { id: deviceId, name: 'Old Mac', teamId, flowNumber: 2, status: 'active', paidThrough: null }
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, subscriptions: new Map([['propresenter', { status: 'active' }]]) }))
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => old)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => false)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => false)
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ status: 'active', flowNumber: 2 }))
  let submitted: any
  t.mock.method(ProPresenterDeviceRequestModel as any, 'create', async (value: any) => { submitted = value; return value })

  await createDeviceRequest({ action: 'add', teamId, requesterId: 10, deviceName: 'New Mac', toFlow: 2, replacesDeviceId: deviceId })
  assert.equal(submitted.replacesDeviceId, deviceId)
  assert.equal(submitted.deviceName, 'New Mac')
  old.paidThrough = new Date(Date.now() + 86_400_000)
  await assert.rejects(createDeviceRequest({ action: 'add', teamId, requesterId: 10, deviceName: 'Another Mac', toFlow: 2, replacesDeviceId: deviceId }), /уже оплачено/)
})

test('approving a replacement adds the new device and releases the old one', async (t) => {
  const requestId = '507f1f77bcf86cd799439012'
  const old: any = { id: deviceId, teamId, flowNumber: 2, status: 'active', name: 'Old Mac', paidThrough: null,
    history: [], async save() { return this } }
  const request: any = { _id: requestId, action: 'add', teamId, toFlow: 2, deviceName: 'New Mac', replacesDeviceId: deviceId }
  t.mock.method(ProPresenterDeviceRequestModel as any, 'findOneAndUpdate', async () => request)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'findOne', async () => null)
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async (filter: any) => filter['history.requestId'] ? null : old)
  t.mock.method(ProPresenterDeviceModel as any, 'findById', async () => old)
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => false)
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10 }))
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ status: 'active', flowNumber: 2 }))
  let added: any
  t.mock.method(ProPresenterDeviceModel as any, 'create', async (value: any) => { added = value; return { _id: '507f1f77bcf86cd799439013', ...value } })

  await decideDeviceRequest(requestId, 99, true)
  assert.equal(added.name, 'New Mac')
  assert.equal(old.status, 'released')
})

test('hub admin cannot move a device while an owner request is pending', async (t) => {
  t.mock.method(ProPresenterDeviceModel as any, 'findById', async () => ({
    flowNumber: 2, status: 'active', history: [], async save() { throw new Error('Must not save') },
  }))
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => false)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'findOne', async () => ({ _id: '507f1f77bcf86cd799439012' }))
  await assert.rejects(applyDeviceChange(deviceId, 'release', undefined, 99), /открытую заявку/)
})
