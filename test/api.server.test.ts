import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import { createApiServer } from '../src/api/server.js'
import { UserModel } from '../src/models/User.js'
import { TeamModel } from '../src/models/Team.js'
import { PaymentModel } from '../src/models/Payment.js'
import { SupportTicketModel } from '../src/models/SupportTicket.js'
import { SupportMessageModel } from '../src/models/SupportMessage.js'

const token = '123456:test-token'
function auth(id = 10) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  params.set('hash', crypto.createHmac('sha256', crypto.createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'))
  return `tma ${params}`
}
async function server(t: any, options = {}) {
  const instance = createApiServer({ botToken: token, port: 0, host: '127.0.0.1', ...options })
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => instance.close(() => resolve())))
  return `http://127.0.0.1:${(instance.address() as any).port}`
}
test('HTTP health, readiness, OpenAPI and method semantics', async t => {
  const base = await server(t)
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/ready`)).status, 503)
  const spec = await (await fetch(`${base}/api/openapi.json`)).json()
  assert.equal(spec.openapi, '3.1.0')
  assert.equal((await fetch(`${base}/missing`)).status, 404)
  const response = await fetch(`${base}/api/me`, { method: 'DELETE' })
  assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET, PATCH')
})
test('invalid auth and nonexistent HUB users are rejected before mutations', async t => {
  const base = await server(t)
  assert.equal((await fetch(`${base}/api/me`)).status, 401)
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: 'tma forged' } })).status, 401)
  t.mock.method(UserModel, 'findOne', async () => null as any)
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: auth() } })).status, 403)
})
test('JSON errors and mass assignment are client errors', async t => {
  process.env.ADMIN_IDS = '99'
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 10, reg: 'done' }) as any)
  const base = await server(t)
  for (const [body, contentType, status] of [['{', 'application/json', 400], ['[]', 'application/json', 400], ['{"fio":{"$gt":""}}', 'application/json', 422], ['{}', 'text/plain', 415], ['x'.repeat(33000), 'application/json', 413]] as const) {
    const response = await fetch(`${base}/api/me`, { method: 'PATCH', headers: { authorization: auth(), 'content-type': contentType }, body })
    assert.equal(response.status, status)
    const value = await response.json(); assert.ok(value.error.requestId); assert.equal(value.error.requestId, response.headers.get('x-request-id'))
  }
})
test('non-admin cannot approve; IDOR team access is hidden', async t => {
  process.env.ADMIN_IDS = '99'
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 10, reg: 'done' }) as any)
  t.mock.method(TeamModel, 'findById', async () => ({ _id: '507f1f77bcf86cd799439011', ownerId: 20, members: [{ telegramId: 20, status: 'active' }] }) as any)
  const base = await server(t)
  assert.equal((await fetch(`${base}/api/admin/payments/507f1f77bcf86cd799439011/accept`, { method: 'POST', headers: { authorization: auth(), 'content-type': 'application/json' }, body: '{}' })).status, 403)
  assert.equal((await fetch(`${base}/api/teams/507f1f77bcf86cd799439011`, { headers: { authorization: auth() } })).status, 404)
})
test('repeat payment confirmation returns saved state without another Telegram delivery', async t => {
  process.env.ADMIN_IDS = '99'
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 99, reg: 'done' }) as any)
  const payment = { _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011', status: 'accepted', productId: 'procontent' }
  t.mock.method(PaymentModel, 'findById', async () => payment as any)
  t.mock.method(PaymentModel, 'findOneAndUpdate', async () => null as any)
  let sent = 0
  const base = await server(t, { telegram: { sendMessage: async () => { sent++; throw new Error('Must not deliver') } } as any })
  const response = await fetch(`${base}/api/admin/payments/${payment.id}/accept`, { method: 'POST', headers: { authorization: auth(99), 'content-type': 'application/json' }, body: '{}' })
  assert.equal(response.status, 200); assert.equal((await response.json()).applied, false); assert.equal(sent, 0)
})
test('support cannot receive messages after closure', async t => {
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 10, reg: 'done' }) as any)
  t.mock.method(SupportTicketModel, 'findOne', async () => ({ _id: '507f1f77bcf86cd799439011', status: 'closed', userId: 10 }) as any)
  t.mock.method(SupportMessageModel, 'find', () => ({ sort: async () => [] }) as any)
  const base = await server(t)
  const response = await fetch(`${base}/api/support/conversations/507f1f77bcf86cd799439011/messages`, { method: 'POST', headers: { authorization: auth(), 'content-type': 'application/json' }, body: '{"text":"Hello"}' })
  assert.equal(response.status, 409)
})
test('CORS is explicit and per-identity rate limiting works', async t => {
  t.mock.method(UserModel, 'findOne', async () => ({ telegramId: 10, reg: 'done' }) as any)
  const base = await server(t, { allowedOrigins: ['http://localhost:3000'], rateLimitPerMinute: 1 })
  const preflight = await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } })
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000')
  assert.equal((await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403)
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: auth() } })).status, 200)
  const limited = await fetch(`${base}/api/me`, { headers: { authorization: auth() } })
  assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'))
})
test('dev auth refuses public binding and is disabled in production', async t => {
  const previous = process.env.NODE_ENV; t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  process.env.NODE_ENV = 'development'
  assert.throws(() => createApiServer({ botToken: token, port: 0, host: '0.0.0.0', allowDevAuth: true }), /loopback/)
  process.env.NODE_ENV = 'production'
  const base = await server(t, { allowDevAuth: true })
  assert.equal((await fetch(`${base}/api/me`, { headers: { authorization: 'dev 99' } })).status, 401)
})
