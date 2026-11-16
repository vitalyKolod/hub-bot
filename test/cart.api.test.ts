import assert from 'node:assert/strict'
import test from 'node:test'
import type { AddressInfo } from 'node:net'

test('team cart API shares pending items and restricts changes to the owner', async () => {
  for (const name of ['ADMIN_GROUP_ID','CONTENT_GROUP_ID','SUPPORT_GROUP_ID','SUNDAY_SCREENS_GROUP_ID','PROP_WAITLIST_THREAD_ID','PROP_STREAM_VERIFY_THREAD_ID']) {
    process.env[name] ||= '1'
  }
  const [{ createApiServer }, { UserModel }, { TeamModel }, { CartModel }] = await Promise.all([
    import('../src/api/server.js'),
    import('../src/models/User.js'),
    import('../src/models/Team.js'),
    import('../src/models/Cart.js'),
  ])
  const teamId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
  const itemId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
  const team: any = { ownerId: 1, members: [{ telegramId: 1 }, { telegramId: 2 }], subscriptions: new Map() }
  const cart: any = { teamId, items: [], save: async () => cart }
  const originalUserFind = UserModel.findOne
  const originalTeamFind = TeamModel.findById
  const originalCartFind = CartModel.findOne
  const originalCartUpdate = CartModel.updateOne
  UserModel.findOne = (async () => ({ telegramId: 1 })) as any
  TeamModel.findById = (async () => team) as any
  CartModel.findOne = (async () => cart) as any
  CartModel.updateOne = (async (_filter: any, update: any) => {
    if (cart.items.some((item: any) => item.product === update.$push.items.product && item.status === 'pending')) return { modifiedCount: 0 }
    cart.items.push({ ...update.$push.items, _id: { toString: () => itemId } })
    return { modifiedCount: 1 }
  }) as any
  const server = createApiServer({ botToken: '123:test', port: 0, host: '127.0.0.1', allowDevAuth: true })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/teams/${teamId}/cart`
    const request = (path: string, user: number, method = 'GET', body?: unknown) => fetch(base + path, {
      method, headers: { authorization: `dev ${user}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    assert.equal((await request('/items', 2, 'POST', { productId: 'procontent' })).status, 403)
    assert.equal((await request('/items', 1, 'POST', { productId: 'propresenter' })).status, 422)
    const added = await request('/items', 1, 'POST', { productId: 'procontent' })
    assert.equal(added.status, 200)
    assert.equal((await added.json()).data.totalRub, 500)
    assert.equal((await request('', 2).then(response => response.json())).data.items.length, 1)
    assert.equal((await request(`/items/${itemId}`, 2, 'DELETE')).status, 403)
    assert.equal((await request(`/items/${itemId}`, 1, 'DELETE')).status, 200)
    assert.equal(cart.items.length, 0)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    UserModel.findOne = originalUserFind
    TeamModel.findById = originalTeamFind
    CartModel.findOne = originalCartFind
    CartModel.updateOne = originalCartUpdate
  }
})
