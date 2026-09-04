import assert from 'node:assert/strict'
import test from 'node:test'

import { CartModel } from '../src/models/Cart.js'
import { ProPresenterWaitlistModel } from '../src/models/ProPresenterWaitlist.js'
import { SupportTicketModel } from '../src/models/SupportTicket.js'
import { TeamModel } from '../src/models/Team.js'
import { TeamInviteModel } from '../src/models/TeamInvite.js'
import { UserModel } from '../src/models/User.js'
import { adminDeleteUser } from '../src/services/adminPanel.service.js'

function execQuery(result: any) {
  const promise = Promise.resolve(result)
  return {
    exec: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

test('adminDeleteUser removes owned data while preserving surviving-team resources', async (t) => {
  const targetId = 700
  const events: string[] = []
  const inviteUpdates: any[] = []
  const waitlistUpdates: any[] = []

  t.mock.method(UserModel as any, 'findOne', () => ({
    select: async () => ({ _id: 'user-doc' }),
  }))
  t.mock.method(TeamModel as any, 'find', () => ({
    select: async () => [{ _id: { toString: () => 'owned-team' } }],
  }))
  t.mock.method(TeamModel as any, 'findById', (teamId: string) => ({
    select: async () => {
      if (teamId === 'owned-team') return { _id: 'owned-team' }
      if (teamId === 'surviving-team') return { _id: 'surviving-team', ownerId: 701 }
      return null
    },
  }))
  t.mock.method(TeamModel as any, 'deleteOne', async () => {
    events.push('owned-team-deleted')
    return { deletedCount: 1 }
  })
  t.mock.method(TeamModel as any, 'updateMany', async () => ({ modifiedCount: 2 }))

  t.mock.method(TeamInviteModel as any, 'find', (filter: any) => {
    if (filter.teamId === 'owned-team') {
      return { select: () => ({ lean: async () => [] }) }
    }
    return {
      select: async () => [
        {
          _id: 'invite-id',
          teamId: 'surviving-team',
          code: 'ABCDEFGH',
        },
      ],
    }
  })
  t.mock.method(TeamInviteModel as any, 'deleteMany', () => execQuery({ deletedCount: 1 }))
  t.mock.method(TeamInviteModel as any, 'updateOne', async (filter: any, update: any) => {
    inviteUpdates.push({ filter, update })
    return { modifiedCount: 1 }
  })
  t.mock.method(TeamInviteModel as any, 'updateMany', async () => ({ modifiedCount: 1 }))
  t.mock.method(TeamInviteModel as any, 'deleteOne', async () => ({ deletedCount: 1 }))

  t.mock.method(ProPresenterWaitlistModel as any, 'find', () => ({
    select: async () => [{ _id: 'wait-id', teamId: 'surviving-team' }],
  }))
  t.mock.method(ProPresenterWaitlistModel as any, 'deleteMany', () =>
    execQuery({ deletedCount: 1 })
  )
  t.mock.method(ProPresenterWaitlistModel as any, 'updateOne', async (filter: any, update: any) => {
    waitlistUpdates.push({ filter, update })
    return { modifiedCount: 1 }
  })
  t.mock.method(ProPresenterWaitlistModel as any, 'deleteOne', async () => ({ deletedCount: 1 }))
  t.mock.method(CartModel as any, 'deleteMany', () => execQuery({ deletedCount: 1 }))
  t.mock.method(SupportTicketModel as any, 'deleteMany', async () => ({ deletedCount: 3 }))
  t.mock.method(UserModel.collection as any, 'updateMany', async () => ({ modifiedCount: 1 }))
  t.mock.method(UserModel as any, 'deleteOne', async () => {
    events.push('user-deleted')
    return { deletedCount: 1 }
  })

  const result = await adminDeleteUser(targetId)

  assert.deepEqual(events, ['owned-team-deleted', 'user-deleted'])
  assert.deepEqual(inviteUpdates, [
    { filter: { _id: 'invite-id' }, update: { $set: { createdBy: 701 } } },
  ])
  assert.deepEqual(waitlistUpdates, [
    { filter: { _id: 'wait-id' }, update: { $set: { requestedBy: 701 } } },
  ])
  assert.deepEqual(result, {
    ownedTeamsDeleted: 1,
    teamMembershipsRemoved: 2,
    invitesReassigned: 1,
    inviteHistoryAnonymized: 1,
    waitlistEntriesReassigned: 1,
    supportTicketsDeleted: 3,
  })
})
