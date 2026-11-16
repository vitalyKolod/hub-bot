import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { authHeader } = createRequire(import.meta.url)('../web/lib/telegram.ts')

test('develop web uses configured real-test identity even after the demo account was switched', t => {
  for (const key of ['NODE_ENV', 'NEXT_PUBLIC_ALLOW_DEV_AUTH', 'NEXT_PUBLIC_DEV_AUTH_USER_ID', 'NEXT_PUBLIC_HUB_DEMO']) {
    const previous = process.env[key]
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const storage = globalThis.sessionStorage
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => '9001' } })
  t.after(() => {
    if (storage === undefined) delete (globalThis as any).sessionStorage
    else Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
  })
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH = 'true'
  process.env.NEXT_PUBLIC_DEV_AUTH_USER_ID = '42'
  process.env.NEXT_PUBLIC_HUB_DEMO = 'false'
  assert.equal(authHeader(), 'dev 42')
  process.env.NEXT_PUBLIC_HUB_DEMO = 'true'
  assert.equal(authHeader(), 'dev 9001')
})
