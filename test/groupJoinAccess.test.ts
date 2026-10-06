import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCTS } from '../src/config/products.js'
import { TeamModel } from '../src/models/Team.js'
import { GroupAccessRevocationModel } from '../src/models/GroupAccessRevocation.js'
import { auditLogService } from '../src/services/auditLog.service.js'
import {
  createProtectedChatInvite, handleProductJoinRequest,
  handleProductMemberJoined, hasEntitlementInTeams,
} from '../src/services/groupJoinAccess.service.js'

const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)
const sampleTeam = (status = 'active', expiresAt = future) => ({
  ownerId: 10,
  members: [{ telegramId: 10, status: 'active' }, { telegramId: 20, status: 'active' }],
  subscriptions: new Map([['procontent', { status, expiresAt }]]),
})

test('only the paying team owner and its active volunteer qualify for the product chat', () => {
  assert.equal(hasEntitlementInTeams([sampleTeam()], ['procontent'], 10), true)
  assert.equal(hasEntitlementInTeams([sampleTeam()], ['procontent'], 20), true)
  assert.equal(hasEntitlementInTeams([sampleTeam()], ['procontent'], 30), false)
  assert.equal(hasEntitlementInTeams([sampleTeam()], ['cmg'], 20), false)
  assert.equal(hasEntitlementInTeams([sampleTeam('active', past)], ['procontent'], 20), false)
  assert.equal(hasEntitlementInTeams([sampleTeam('expired', future)], ['procontent'], 20), true)
})

test('a forwarded link cannot approve an unentitled Telegram ID', async () => {
  const oldGroup = PRODUCTS.procontent.groupId
  const oldFind = TeamModel.find
  const oldTaskFind = GroupAccessRevocationModel.findOne
  const oldLog = auditLogService.createLog
  const chatId = -1001234567890
  PRODUCTS.procontent.groupId = chatId
  ;(TeamModel as any).find = async () => [sampleTeam()]
  ;(GroupAccessRevocationModel as any).findOne = async () => null
  ;(auditLogService as any).createLog = async () => undefined
  const calls: string[] = []
  const api: any = {
    async createChatInviteLink(_chatId: number, options: any) {
      assert.equal(options.creates_join_request, true)
      assert.ok(options.expire_date > Date.now() / 1000)
      calls.push('link')
      return { invite_link: 'https://t.me/+test' }
    },
    async approveChatJoinRequest() { calls.push('approve') },
    async declineChatJoinRequest() { calls.push('decline') },
    async banChatMember() { calls.push('ban') },
  }
  try {
    assert.ok(await createProtectedChatInvite(api, 'procontent', 10))
    assert.ok(await createProtectedChatInvite(api, 'procontent', 20))
    assert.equal(await createProtectedChatInvite(api, 'procontent', 30), null)
    assert.equal(await handleProductJoinRequest(api, chatId, 20), true)
    assert.equal(await handleProductJoinRequest(api, chatId, 30), true)
    assert.equal(await handleProductMemberJoined(api, chatId, 20), true)
    assert.deepEqual(calls, ['link', 'link', 'approve', 'decline'])
  } finally {
    PRODUCTS.procontent.groupId = oldGroup
    ;(TeamModel as any).find = oldFind
    ;(GroupAccessRevocationModel as any).findOne = oldTaskFind
    ;(auditLogService as any).createLog = oldLog
  }
})

test('direct entry through an old copied link is blocked and recorded for later restoration', async () => {
  const oldGroup = PRODUCTS.procontent.groupId
  const oldFind = TeamModel.find
  const oldUpsert = GroupAccessRevocationModel.findOneAndUpdate
  const oldLog = auditLogService.createLog
  const chatId = -1001234567890
  PRODUCTS.procontent.groupId = chatId
  ;(TeamModel as any).find = async () => [sampleTeam()]
  const task: any = { status: 'pending', async save() {} }
  ;(GroupAccessRevocationModel as any).findOneAndUpdate = async () => task
  ;(auditLogService as any).createLog = async () => undefined
  let bans = 0
  const api: any = { async banChatMember() { bans++ } }
  try {
    assert.equal(await handleProductMemberJoined(api, chatId, 30), true)
    assert.equal(bans, 1)
    assert.equal(task.status, 'blocked')
  } finally {
    PRODUCTS.procontent.groupId = oldGroup
    ;(TeamModel as any).find = oldFind
    ;(GroupAccessRevocationModel as any).findOneAndUpdate = oldUpsert
    ;(auditLogService as any).createLog = oldLog
  }
})
