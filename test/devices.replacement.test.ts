import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'
import { ProPresenterRenewalSeatModel } from '../src/models/ProPresenterRenewal.js'
import { replaceTeamDevice } from '../src/services/proPresenterDevice.service.js'

const input = { teamId: '507f1f77bcf86cd799439010', deviceId: '507f1f77bcf86cd799439011', requesterId: 10, name: ' New   PC ' }

test('replacement preserves the paid seat and records old and new hardware names', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10 }))
  t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => false)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => false)
  const original = { _id: input.deviceId, name: 'Old PC', flowNumber: 2, paidThrough: new Date('2099-01-01'), updatedAt: new Date() }
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => original)
  const update = t.mock.method(ProPresenterDeviceModel as any, 'findOneAndUpdate', async () => ({ ...original, name: 'New PC' }))
  const result = await replaceTeamDevice(input)
  assert.equal(result.previousName, 'Old PC')
  assert.equal(result.device.paidThrough, original.paidThrough)
  const [filter, mutation] = update.mock.calls[0].arguments as any[]
  assert.equal(filter.updatedAt, original.updatedAt)
  assert.deepEqual(mutation.$set, { name: 'New PC' })
  assert.equal(mutation.$push.history.previousName, 'Old PC')
  assert.equal(mutation.$push.history.actorId, 10)
})

test('replacement rejects non-owners and pending payments or device requests', async (t) => {
  const owner = t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 11 }))
  await assert.rejects(() => replaceTeamDevice(input), /владелец/)
  owner.mock.mockImplementation(async () => ({ ownerId: 10 }))
  const payment = t.mock.method(ProPresenterRenewalSeatModel as any, 'exists', async () => true)
  await assert.rejects(() => replaceTeamDevice(input), /чек на проверке/)
  payment.mock.mockImplementation(async () => false)
  t.mock.method(ProPresenterDeviceRequestModel as any, 'exists', async () => true)
  await assert.rejects(() => replaceTeamDevice(input), /заявка на проверке/)
})
