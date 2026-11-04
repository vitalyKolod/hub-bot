import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterDeviceModel } from '../src/models/ProPresenterDevice.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { ProPresenterWaitlistModel } from '../src/models/ProPresenterWaitlist.js'
import { connectTeamDevice } from '../src/services/proPresenterDevice.service.js'

const input = { teamId: '507f1f77bcf86cd799439010', requesterId: 42, flowNumber: 6, name: 'MacBook' }

test('owner can connect only within the configured team limit', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({
    ownerId: 42, deviceLimit: 2, subscriptions: new Map([['propresenter', { status: 'active' }]]),
  }))
  const count = t.mock.method(ProPresenterDeviceModel as any, 'countDocuments', async () => 1)
  t.mock.method(ProPresenterWaitlistModel as any, 'find', async () => [])
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ status: 'active', capacity: 10 }))
  t.mock.method(ProPresenterDeviceModel as any, 'create', async (data: any) => data)
  const connected = await connectTeamDevice(input)
  assert.equal(connected.name, 'MacBook')
  count.mock.mockImplementation(async () => 2)
  await assert.rejects(() => connectTeamDevice(input), /Достигнут лимит.*2/)
})
