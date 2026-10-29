import assert from 'node:assert/strict'
import test from 'node:test'
import { telegramDeliveryFallback } from '../src/utils/telegramDeliveryFallback.js'

test('privacy-restricted profile button is removed while other buttons stay', async () => {
  const calls: any[] = []
  const prev: any = async (_method: string, payload: any) => {
    calls.push(payload)
    return calls.length === 1
      ? { ok: false, error_code: 400, description: 'Bad Request: BUTTON_USER_PRIVACY_RESTRICTED' }
      : { ok: true, result: { message_id: 1 } }
  }
  const payload: any = {
    chat_id: 1, text: 'Карточка',
    reply_markup: { inline_keyboard: [
      [{ text: 'Профиль', url: 'tg://user?id=42' }],
      [{ text: 'Команда', callback_data: 'team:1' }],
    ] },
  }
  const result = await telegramDeliveryFallback(prev, 'sendMessage', payload)
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].reply_markup.inline_keyboard, [[{ text: 'Команда', callback_data: 'team:1' }]])
  assert.equal(payload.reply_markup.inline_keyboard.length, 2)
})

test('invalid Markdown is retried once as plain text', async () => {
  const calls: any[] = []
  const prev: any = async (_method: string, payload: any) => {
    calls.push(payload)
    return calls.length === 1
      ? { ok: false, error_code: 400, description: "Bad Request: can't parse entities: Can't find end of the entity" }
      : { ok: true, result: { message_id: 1 } }
  }
  const result = await telegramDeliveryFallback(prev, 'sendMessage', { chat_id: 1, text: 'Имя_с_символами', parse_mode: 'Markdown' } as any)
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].text, 'Имя_с_символами')
  assert.equal(calls[1].parse_mode, undefined)
})

test('other delivery errors are not retried', async () => {
  let calls = 0
  const prev: any = async () => { calls++; return { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }
  const result = await telegramDeliveryFallback(prev, 'sendMessage', { chat_id: 1, text: 'Привет' } as any)
  assert.equal(result.ok, false)
  assert.equal(calls, 1)
})

test('privacy and formatting failures are each retried at most once', async () => {
  const calls: any[] = []
  const errors = [
    'Bad Request: BUTTON_USER_PRIVACY_RESTRICTED',
    "Bad Request: can't parse entities",
  ]
  const prev: any = async (_method: string, payload: any) => {
    calls.push(payload)
    const description = errors.shift()
    return description ? { ok: false, error_code: 400, description } : { ok: true, result: { message_id: 1 } }
  }
  const result = await telegramDeliveryFallback(prev, 'sendMessage', {
    chat_id: 1, text: '*Имя_', parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: 'Профиль', url: 'tg://user?id=42' }]] },
  } as any)
  assert.equal(result.ok, true)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].parse_mode, undefined)
  assert.equal(calls[2].reply_markup, undefined)
})
