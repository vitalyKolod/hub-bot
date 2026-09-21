import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import {
  TelegramWebAppAuthError,
  verifyTelegramWebAppInitData,
} from '../src/api/auth/telegramWebAppAuth.js'

const BOT_TOKEN = '123456:test-token'
const NOW = new Date('2026-09-16T12:00:00.000Z')

function signedInitData(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(NOW.getTime() / 1000)),
    query_id: 'AAEAAAE',
    user: JSON.stringify({ id: 42, first_name: 'Vitaly', username: 'vitaly' }),
    ...overrides,
  })
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'))
  return params.toString()
}

test('accepts valid Telegram initData and returns the signed user', () => {
  const session = verifyTelegramWebAppInitData(signedInitData(), BOT_TOKEN, { now: NOW })
  assert.equal(session.user.id, 42)
  assert.equal(session.user.username, 'vitaly')
})

test('includes the Telegram signature field in bot-token HMAC validation', () => {
  const session = verifyTelegramWebAppInitData(signedInitData({ signature: 'telegram-signature' }), BOT_TOKEN, { now: NOW })
  assert.equal(session.user.id, 42)
})

test('rejects tampered Telegram initData', () => {
  const initData = signedInitData().replace('Vitaly', 'Mallory')
  assert.throws(
    () => verifyTelegramWebAppInitData(initData, BOT_TOKEN, { now: NOW }),
    TelegramWebAppAuthError
  )
})

test('rejects expired Telegram initData', () => {
  const oldAuthDate = String(Math.floor(NOW.getTime() / 1000) - 901)
  assert.throws(
    () => verifyTelegramWebAppInitData(signedInitData({ auth_date: oldAuthDate }), BOT_TOKEN, { now: NOW }),
    /expired/
  )
})
