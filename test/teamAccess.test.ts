import assert from 'node:assert/strict'
import test from 'node:test'
import { isTeamMember } from '../src/api/auth/teamAccess.js'

test('team detail access is limited to members', () => {
  const team = { members: [{ telegramId: 10 }, { telegramId: 20 }] }
  assert.equal(isTeamMember(team, 10), true)
  assert.equal(isTeamMember(team, 30), false)
})
