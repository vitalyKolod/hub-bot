import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeGroupRemovalError, runReminders } from '../src/services/reminder.service.js'
import { TeamModel } from '../src/models/Team.js'
import { ProPresenterStreamModel } from '../src/models/ProPresenterStream.js'
import { GroupAccessRevocationModel } from '../src/models/GroupAccessRevocation.js'
import { auditLogService } from '../src/services/auditLog.service.js'

function team(id: string, userId: number, status: string, expiresAt: Date) {
  return { _id: { toString: () => id }, name: id, ownerId: userId,
    members: [{ telegramId: userId, status: 'active' }], reminders: [],
    subscriptions: new Map([['procontent', { status, expiresAt, meta: {} }]]),
    async save() {} }
}

test('expired access retries after failure, but another active team retains access', async () => {
  const { PRODUCTS } = await import('../src/config/products.js')
  const oldGroup = PRODUCTS.procontent.groupId
  PRODUCTS.procontent.groupId = -1001234567890
  const original = {
    findTeams: TeamModel.find, findStreams: ProPresenterStreamModel.find,
    findTasks: GroupAccessRevocationModel.find,
    upsert: GroupAccessRevocationModel.findOneAndUpdate,
    createLog: auditLogService.createLog,
  }
  const tasks = new Map<string, any>()
  let teams: any[] = []
  let bans = 0
  let unbans = 0
  let fail = true
  ;(TeamModel as any).find = async () => teams
  ;(ProPresenterStreamModel as any).find = async () => []
  ;(GroupAccessRevocationModel as any).find = async (query: any) =>
    [...tasks.values()].filter(t => query.status?.$in ? query.status.$in.includes(t.status) : t.status === query.status)
  ;(GroupAccessRevocationModel as any).findOneAndUpdate = async (filter: any, update: any) => {
    const key = `${filter.chatId}:${filter.telegramId}`
    if (!tasks.has(key)) tasks.set(key, { ...update.$setOnInsert, attempts: 0,
      nextAttemptAt: new Date(0), async save() {} })
    return tasks.get(key)
  }
  ;(auditLogService as any).createLog = async () => undefined
  const bot: any = { api: { async banChatMember() { bans++; if (fail) throw new Error('temporary') },
    async unbanChatMember() { unbans++ }, async sendMessage() {} } }
  try {
    const expired = team('expired', 123, 'expired', new Date(0))
    teams = [expired, team('active', 123, 'active', new Date(Date.now() + 86400000))]
    await runReminders(bot)
    assert.equal(bans, 0)
    assert.equal([...tasks.values()][0].status, 'protected')
    teams = [expired]
    await runReminders(bot)
    assert.equal(bans, 1)
    assert.equal([...tasks.values()][0].status, 'pending')
    assert.equal([...tasks.values()][0].attempts, 1)
    fail = false
    ;[...tasks.values()][0].nextAttemptAt = new Date(0)
    await runReminders(bot)
    assert.equal(bans, 2)
    assert.equal([...tasks.values()][0].status, 'blocked')
    await runReminders(bot)
    assert.equal(bans, 2)
    // Старый статус expired при дате в будущем не должен удерживать бан.
    teams = [team('expired', 123, 'expired', new Date(Date.now() + 86400000))]
    await runReminders(bot)
    assert.equal(bans, 2)
    assert.equal(unbans, 1)
    assert.equal([...tasks.values()][0].status, 'restored')
    // Осиротевшая задача после удаления команды не должна снова банить человека.
    teams = []
    await runReminders(bot)
    assert.equal(bans, 2)
    assert.equal([...tasks.values()][0].status, 'protected')
  } finally {
    ;(TeamModel as any).find = original.findTeams
    ;(ProPresenterStreamModel as any).find = original.findStreams
    ;(GroupAccessRevocationModel as any).find = original.findTasks
    ;(GroupAccessRevocationModel as any).findOneAndUpdate = original.upsert
    ;(auditLogService as any).createLog = original.createLog
    PRODUCTS.procontent.groupId = oldGroup
  }
})

test('Telegram participant error is explained without inventing a definite cause', () => {
  const result = describeGroupRemovalError(new Error('400 Bad Request: PARTICIPANT_ID_INVALID'))
  assert.match(result.diagnosis, /не распознал участника/)
  assert.match(result.action, /ID чата/)
  assert.doesNotMatch(result.diagnosis, /точно|однозначно/)
})
