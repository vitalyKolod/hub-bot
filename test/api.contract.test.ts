import assert from 'node:assert/strict'
import test from 'node:test'
import { validateBody, openApi, matchRoute } from '../src/api/contract.js'
import { apiRoutes } from '../src/api/routes.js'
import { ApiError, pagination } from '../src/api/http.js'
import { serializeDevice, serializeStream } from '../src/api/serializers.js'

test('every admin route has an explicit permission and unique method/path', () => {
  const keys = apiRoutes.map(r => `${r.method} ${r.path}`)
  assert.equal(new Set(keys).size, keys.length)
  for (const route of apiRoutes.filter(r => r.path.startsWith('/api/admin/'))) assert.ok(route.permission, `${route.path} must be protected`)
  assert.ok(apiRoutes.length > 90)
  const spec = openApi(apiRoutes)
  for (const route of apiRoutes) assert.equal(spec.paths[route.path.replace(/:([^/]+)/g, '{$1}')][route.method.toLowerCase()]['x-hub-permission'], route.permission || null)
})
test('contract rejects Mongo operators, mass assignment and invalid IDs', () => {
  const create = apiRoutes.find(r => r.method === 'POST' && r.path === '/api/teams')!
  assert.throws(() => validateBody({ name: 'Team', ownerId: 99 }, create.body!), ApiError)
  assert.throws(() => validateBody({ name: { $gt: '' } }, create.body!), ApiError)
  assert.throws(() => validateBody({ name: ' ' }, create.body!), ApiError)
  validateBody({ name: 'Team' }, create.body!)
  const subscription = apiRoutes.find(r => r.path.endsWith('/extend'))!
  assert.throws(() => validateBody({ months: 0 }, subscription.body!), ApiError)
  const move = apiRoutes.find(r => r.path === '/api/admin/tutorials/topics/:id/move')!
  assert.throws(() => validateBody({ direction: 0 }, move.body!), ApiError)
})
test('pagination is bounded; paths decode only after matching', () => {
  assert.deepEqual(pagination(new URLSearchParams('page=2&limit=10')), { page: 2, limit: 10, skip: 20 })
  for (const query of ['page=-1', 'page=10001', 'limit=101', 'limit=0', 'page=NaN']) assert.throws(() => pagination(new URLSearchParams(query)), ApiError)
  const route = apiRoutes.find(r => r.path === '/api/teams/:teamId')!
  assert.deepEqual(matchRoute(route, '/api/teams/abcdef'), { teamId: 'abcdef' })
  assert.equal(matchRoute(route, '/api/teams/abcdef/devices'), null)
})
test('stream and device DTOs never leak credentials or internal history', () => {
  const stream = serializeStream({ _id: 's', email: 'secret', password: 'secret', chatLink: 'secret', capacity: 20 })
  const device = serializeDevice({ _id: 'd', name: 'Mac', history: [{ secret: true }] })
  assert.equal('password' in stream, false); assert.equal('email' in stream, false); assert.equal('chatLink' in stream, false); assert.equal('history' in device, false)
})

test('payment, support and device schemas have no competing index definitions', async () => {
  const { PaymentModel } = await import('../src/models/Payment.js')
  const { SupportTicketModel } = await import('../src/models/SupportTicket.js')
  const { ProPresenterDeviceRequestModel } = await import('../src/models/ProPresenterDevice.js')
  for (const model of [PaymentModel, SupportTicketModel, ProPresenterDeviceRequestModel]) {
    const keys = model.schema.indexes().map(([key]) => JSON.stringify(key))
    assert.equal(new Set(keys).size, keys.length, `${model.modelName} has a conflicting index`)
  }
})
