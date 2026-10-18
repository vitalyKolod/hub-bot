import assert from 'node:assert/strict'
import test from 'node:test'
import { ProPresenterWaitlistModel } from '../src/models/ProPresenterWaitlist.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'
import { TeamModel } from '../src/models/Team.js'
import { addToWaitlist, countRequestedDevices } from '../src/services/proPresenterWaitlist.service.js'
import { assignReservedDevice, reduceReservedSeats } from '../src/services/proPresenterDevice.service.js'
import { devicesScreen } from '../src/screens/devices.js'

test('one application with two devices moves intact to the next batch when only one seat remains', async (t) => {
  const created: any[] = []
  t.mock.method(ProPresenterWaitlistModel as any, 'find', (filter: any) => {
    const entries = filter.assignedFlowNumber === 5 ? [{ deviceCount: 19 }] : created
    return { sort: async () => [], then: (resolve: any) => Promise.resolve(entries).then(resolve) }
  })
  t.mock.method(ProPresenterWaitlistModel as any, 'findOne', (filter: any) =>
    filter.teamId ? null : { sort: async () => ({ assignedFlowNumber: 5 }) })
  t.mock.method(ProPresenterStreamModel as any, 'findOne', () => ({ sort: async () => ({ flowNumber: 4 }) }))
  t.mock.method(ProPresenterWaitlistModel as any, 'create', async (entry: any) => {
    created.push(entry)
    return entry
  })
  const result = await addToWaitlist('team', 42, 2)
  assert.equal(result.entry.assignedFlowNumber, 6)
  assert.equal(result.position, 2)
  assert.equal(countRequestedDevices([{ deviceCount: 3 }, {}]), 4)
})

test('assigned seats appear as separate buttons and an owner can use and reduce them', async (t) => {
  const team = { ownerId: 42, name: 'Команда', members: [], subscriptions: new Map([
    ['propresenter', { status: 'active', meta: { flowNumber: 6 } }],
  ]) }
  const reservation = { teamId: 'team', status: 'assigned', assignedFlowNumber: 6, deviceCount: 3, save: async () => {} }
  t.mock.method(TeamModel as any, 'findById', async () => team)
  t.mock.method(ProPresenterWaitlistModel as any, 'find', () => ({ sort: async () => [reservation], then: (resolve: any) => Promise.resolve([reservation]).then(resolve) }))
  t.mock.method(ProPresenterWaitlistModel as any, 'findOne', async () => reservation)
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceRequestModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceModel as any, 'countDocuments', async () => 0)
  t.mock.method(ProPresenterDeviceModel as any, 'create', async (data: any) => data)
  t.mock.method(ProPresenterStreamModel as any, 'findOne', async () => ({ status: 'active' }))

  const screen = await devicesScreen(42, 'team')
  const buttons = screen.keyboard.inline_keyboard.flat().map((item) => item.text)
  assert.equal(buttons.filter((item) => item.startsWith('Назначить устройство')).length, 3)
  assert.match(screen.caption, /Устройство пока не назначено/)
  assert.equal((await assignReservedDevice('team', 42, 6, 'MacBook')).name, 'MacBook')
  await reduceReservedSeats('team', 42, 6, 2)
  assert.equal(reservation.deviceCount, 2)
})
