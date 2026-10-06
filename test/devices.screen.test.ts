import assert from 'node:assert/strict'
import test from 'node:test'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { devicesScreen } from '../src/screens/devices.js'

test('owner device screen uses the supplied image and one compact action menu', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, name: 'Команда' }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [
    { id: '507f1f77bcf86cd799439011', name: 'MacBook', flowNumber: 2 },
  ] }))
  t.mock.method(ProPresenterDeviceRequestModel as any, 'find', () => ({ sort: async () => [] }))

  const screen = await devicesScreen(10, { teamId: '507f1f77bcf86cd799439010' })

  assert.equal(screen.photo, './public/devices.png')
  assert.match(screen.caption, /MacBook — поток №2/)
  const buttons = screen.keyboard.inline_keyboard.flat()
  assert.deepEqual(buttons.map((button) => button.text), [
    'Добавить устройство', 'Отказаться от устройства', 'Перенести в другой поток', '◀️ НАЗАД',
  ])
  assert.deepEqual(buttons.slice(0, 3).map((button) => button.icon_custom_emoji_id), [
    '5260251205682079529', '5300821986451148615', '5260450573768990626',
  ])
})

test('navigation passes team id as a string and an active volunteer can only view devices', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, name: 'Команда', members: [{ telegramId: 11, status: 'active' }] }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [
    { id: '507f1f77bcf86cd799439011', name: 'MacBook', flowNumber: 2 },
  ] }))
  t.mock.method(ProPresenterDeviceRequestModel as any, 'find', () => ({ sort: async () => [] }))

  const teamId = '507f1f77bcf86cd799439010'
  const owner = await devicesScreen(10, teamId)
  const volunteer = await devicesScreen(11, teamId)
  assert.match(volunteer.caption, /MacBook — поток №2/)
  assert.deepEqual(volunteer.keyboard.inline_keyboard.flat().map((button) => button.text), ['◀️ НАЗАД'])
  assert.ok(owner.keyboard.inline_keyboard.flat().some((button) => button.text === 'Добавить устройство'))
  await assert.rejects(() => devicesScreen(11, { teamId, step: 'add_flow' }), /только владельцу/)
})

test('move destinations use the same three-column number grid as ProPresenter', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, name: 'Команда' }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceRequestModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => ({ id: '507f1f77bcf86cd799439011', name: 'MacBook', flowNumber: 2 }))
  t.mock.method(ProPresenterStreamModel as any, 'find', () => ({ sort: async () => [1, 3, 4, 5].map((flowNumber) => ({ flowNumber, status: 'active', capacity: 30 })) }))
  t.mock.method(ProPresenterDeviceModel as any, 'countDocuments', async () => 0)

  const screen = await devicesScreen(10, { teamId: '507f1f77bcf86cd799439010', step: 'move_flow', deviceId: '507f1f77bcf86cd799439011' })
  assert.deepEqual(screen.keyboard.inline_keyboard.map((row) => row.map((button) => button.text)), [
    ['1', '3', '4'], ['5'], ['‹ К устройствам'],
  ])
})

test('request confirmation button has no device icon', async (t) => {
  t.mock.method(TeamModel as any, 'findById', async () => ({ ownerId: 10, name: 'Команда' }))
  t.mock.method(ProPresenterDeviceModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceRequestModel as any, 'find', () => ({ sort: async () => [] }))
  t.mock.method(ProPresenterDeviceModel as any, 'findOne', async () => ({ id: '507f1f77bcf86cd799439011', name: 'MacBook', flowNumber: 2 }))

  const screen = await devicesScreen(10, { teamId: '507f1f77bcf86cd799439010', step: 'release_confirm', deviceId: '507f1f77bcf86cd799439011' })
  const button = screen.keyboard.inline_keyboard[0][0]
  assert.equal(button.text, '✅ Отправить заявку')
  assert.equal(button.icon_custom_emoji_id, undefined)
})
