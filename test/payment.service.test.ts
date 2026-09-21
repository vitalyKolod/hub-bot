import assert from 'node:assert/strict'
import test from 'node:test'
import { PaymentModel } from '../src/models/Payment.js'
import { TeamModel } from '../src/models/Team.js'
import { AuditLogModel } from '../src/models/AuditLog.js'
import { acceptPayment, rejectPayment } from '../src/services/payment.service.js'

function payment(status = 'processing') {
  return {
    _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011',
    userId: 10, teamId: 'team-1', productId: 'procontent', cartItemId: null,
    paymentMethod: 'Рубли — СБП', operation: 'purchase', status,
    save: async function () { return this },
  } as any
}

test('acceptPayment activates once and double accept is idempotent', async (t) => {
  const claimed = payment()
  let claims = 0
  let teamSaves = 0
  const team: any = { _id: 'team-1', id: 'team-1', name: 'Team', ownerId: 10, subscriptions: new Map(), save: async () => { teamSaves++ } }
  t.mock.method(PaymentModel as any, 'findOneAndUpdate', async () => (++claims === 1 ? claimed : null))
  t.mock.method(PaymentModel as any, 'findById', async () => claimed)
  t.mock.method(TeamModel as any, 'findById', async () => team)
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)

  const first = await acceptPayment(claimed.id, 99)
  const second = await acceptPayment(claimed.id, 99)
  assert.equal(first.applied, true)
  assert.equal(second.applied, false)
  assert.equal(claimed.status, 'accepted')
  assert.equal(teamSaves, 1)
})

test('rejectPayment records a terminal decision without activating subscription', async (t) => {
  const rejected = payment('rejected')
  t.mock.method(PaymentModel as any, 'findOneAndUpdate', async () => rejected)
  t.mock.method(TeamModel as any, 'findById', async () => ({ name: 'Team', ownerId: 10 }))
  t.mock.method(AuditLogModel as any, 'create', async (value: any) => value)
  const result = await rejectPayment(rejected.id, 99)
  assert.equal(result.applied, true)
  assert.equal(result.payment.status, 'rejected')
})
