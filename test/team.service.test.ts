import assert from 'node:assert/strict'
import test from 'node:test'

import { TeamModel } from '../src/models/Team.js'
import { UserModel } from '../src/models/User.js'
import {
  createTeam,
  createTeamForUser,
  generateTeamNameForUser,
  normalizeTeamName,
  TEAM_NAME_MAX_LENGTH,
  TeamNameValidationError,
  TeamOwnerNotFoundError,
  validateTeamName,
} from '../src/services/team.service.js'

test('generateTeamNameForUser follows all fallback rules and normalizes whitespace', () => {
  assert.equal(
    generateTeamNameForUser({ church: '  Спасение  ', city: ' ст.   Ханская ' }),
    'Спасение · ст. Ханская'
  )
  assert.equal(generateTeamNameForUser({ church: '\nСпасение\t' }), 'Спасение')
  assert.equal(generateTeamNameForUser({ city: '  Краснодар ' }), 'Команда · Краснодар')
  assert.equal(generateTeamNameForUser({ fio: ' Иван   Иванов ' }), 'Команда Иван Иванов')
  assert.equal(
    generateTeamNameForUser({ church: null, city: undefined, fio: '   ' }),
    'Новая команда'
  )
})

test('generated and manual names stay safe for the existing 50-character UI limit', () => {
  const generated = generateTeamNameForUser({ church: 'A'.repeat(60), city: 'Москва' })
  assert.equal(generated.length, TEAM_NAME_MAX_LENGTH)
  assert.equal(normalizeTeamName('  Media\n\tTeam  '), 'Media Team')
  assert.equal(validateTeamName('  Media   Team  '), 'Media Team')
  assert.throws(() => validateTeamName('   '), TeamNameValidationError)
  assert.throws(() => validateTeamName('A'.repeat(TEAM_NAME_MAX_LENGTH + 1)), TeamNameValidationError)
})

test('createTeamForUser persists the target as the active owner and emits the audit hook', async (t) => {
  let createPayload: any
  let auditEvent: any

  t.mock.method(UserModel as any, 'exists', async () => ({ _id: 'user-id' }))
  t.mock.method(TeamModel as any, 'create', async (payload: any) => {
    createPayload = payload
    return {
      _id: { toString: () => 'team-id' },
      ...payload,
      createdAt: new Date('2026-09-04T12:00:00.000Z'),
    }
  })
  t.mock.method(console, 'info', (event: string, payload: any) => {
    auditEvent = { event, payload }
  })

  const team = await createTeamForUser({
    userId: 200,
    name: '  Media   Team  ',
    createdByAdminId: 100,
  })

  assert.deepEqual(createPayload, {
    name: 'Media Team',
    ownerId: 200,
    members: [{ telegramId: 200, role: 'owner', status: 'active' }],
  })
  assert.equal('createdByAdminId' in createPayload, false)
  assert.equal(team.name, 'Media Team')
  assert.equal(auditEvent.event, 'admin_created_team')
  assert.equal(auditEvent.payload.adminTelegramId, 100)
  assert.equal(auditEvent.payload.targetUserId, 200)
  assert.equal(auditEvent.payload.teamId, 'team-id')
})

test('ordinary createTeam remains a wrapper over the same owner/member invariant', async (t) => {
  let createPayload: any
  t.mock.method(UserModel as any, 'exists', async () => ({ _id: 'user-id' }))
  t.mock.method(TeamModel as any, 'create', async (payload: any) => {
    createPayload = payload
    return { _id: { toString: () => 'team-id' }, ...payload }
  })

  await createTeam(300, '  Worship   Team ')

  assert.deepEqual(createPayload, {
    name: 'Worship Team',
    ownerId: 300,
    members: [{ telegramId: 300, role: 'owner', status: 'active' }],
  })
})

test('createTeamForUser rejects a deleted target before creating a team', async (t) => {
  let createCalled = false
  t.mock.method(UserModel as any, 'exists', async () => null)
  t.mock.method(TeamModel as any, 'create', async () => {
    createCalled = true
    return null
  })

  await assert.rejects(
    createTeamForUser({ userId: 404, name: 'Media Team', createdByAdminId: 100 }),
    TeamOwnerNotFoundError
  )
  assert.equal(createCalled, false)
})
