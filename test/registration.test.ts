import assert from 'node:assert/strict'
import test from 'node:test'

process.env.ADMIN_GROUP_ID ||= '-1003775348160'
process.env.CONTENT_GROUP_ID ||= '-100124'
process.env.SUPPORT_GROUP_ID ||= '-100125'
process.env.SUNDAY_SCREENS_GROUP_ID ||= '-100126'
process.env.PROP_WAITLIST_THREAD_ID ||= '10'
process.env.PROP_STREAM_VERIFY_THREAD_ID ||= '11'

import { UserModel } from '../src/models/User.js'
import { AuditLogModel } from '../src/models/AuditLog.js'
import { registerScreens } from '../src/core/render.js'
import {
  buildConfirmationMessage,
  REGISTRATION_FIELDS,
  sendRegistrationAdminNotification,
} from '../src/flows/registration/index.js'
import {
  handleConfirmRegistration,
  handleEditRegistration,
  handleEditRegistrationBack,
  handleEditingFieldText,
} from '../src/handlers/registration.handlers.js'

const profile = {
  telegramId: 42,
  username: 'volunteer',
  fio: 'Волонтер тест',
  city: 'Майкоп',
  church: 'Спасение',
  reg: 'in_progress',
  regStep: 'confirm_registration',
}

function keyboardCallbacks(markup: any) {
  return markup.inline_keyboard.flat().map((button: any) => button.callback_data)
}

test('registration notification uses the admin group general feed', async (t) => {
  let sent: any[] | undefined
  t.mock.method(UserModel as any, 'findOne', async () => profile)

  await sendRegistrationAdminNotification(
    { from: { id: 42 }, api: { sendMessage: async (...args: any[]) => (sent = args) } },
    42
  )

  assert.equal(sent?.[0], -1003775348160)
  assert.equal('message_thread_id' in sent?.[2], false)
  assert.match(sent?.[1], /Волонтер тест/)
  assert.match(sent?.[1], /@volunteer/)
  assert.doesNotMatch(sent?.[1], /verify:/)
  const buttons = sent?.[2].reply_markup.inline_keyboard.flat()
  assert.equal(buttons.some((button: any) => button.text === '💬 Написать пользователю'), false)
  assert.equal(buttons.find((button: any) => button.url)?.url, 'tg://user?id=42')
})

test('confirmation screen reuses the edit menu field icons', async (t) => {
  t.mock.method(UserModel as any, 'findOne', async () => profile)
  const confirmation = await buildConfirmationMessage(42)
  const customEmojiIds = confirmation.entities
    .filter((entity: any) => entity.type === 'custom_emoji')
    .map((entity: any) => entity.custom_emoji_id)

  assert.deepEqual(customEmojiIds, Object.values(REGISTRATION_FIELDS).map((field) => field.customEmojiId))

  let editOptions: any
  await handleEditRegistration({ editMessageText: async (_text: string, options: any) => (editOptions = options) } as any)
  assert.deepEqual(keyboardCallbacks(editOptions.reply_markup), [
    'edit_field:fio',
    'edit_field:city',
    'edit_field:church',
    'edit_registration_back',
  ])
})

test('back from edit menu preserves data and restores confirmation', async (t) => {
  t.mock.method(UserModel as any, 'findOne', async () => profile)
  let updateCalls = 0
  t.mock.method(UserModel as any, 'updateOne', async () => {
    updateCalls++
    return { modifiedCount: 1 }
  })
  let restored: any

  await handleEditRegistrationBack({ editMessageText: async (...args: any[]) => (restored = args) } as any, 42)

  assert.equal(updateCalls, 0)
  assert.match(restored[0], /ПРОВЕРКА ДАННЫХ/)
  assert.deepEqual(keyboardCallbacks(restored[1].reply_markup), ['confirm_registration', 'edit_registration'])
})

test('editing one field keeps the other fields and returns to confirmation', async (t) => {
  let update: any
  t.mock.method(UserModel as any, 'updateOne', async (_filter: any, payload: any) => {
    update = payload
    return { modifiedCount: 1 }
  })
  t.mock.method(UserModel as any, 'findOne', async () => ({ ...profile, city: 'Москва' }))
  t.mock.method(AuditLogModel as any, 'create', async (payload: any) => ({ ...payload, createdAt: new Date() }))
  const replies: any[] = []
  const ctx: any = {
    session: { editingField: 'city' },
    message: { text: 'Москва' },
    reply: async (...args: any[]) => replies.push(args),
  }

  await handleEditingFieldText(ctx, 42)

  assert.deepEqual(update, { $set: { city: 'Москва' } })
  assert.equal(ctx.session.editingField, undefined)
  assert.match(replies.at(-1)[0], /Волонтер тест/)
  assert.match(replies.at(-1)[0], /Спасение/)
  assert.deepEqual(keyboardCallbacks(replies.at(-1)[1].reply_markup), ['confirm_registration', 'edit_registration'])
})

test('notification failure does not roll back completed registration', async (t) => {
  let storedReg = 'in_progress'
  t.mock.method(UserModel as any, 'findOne', async () => ({ ...profile, reg: storedReg }))
  t.mock.method(UserModel as any, 'updateOne', async () => {
    storedReg = 'done'
    return { modifiedCount: 1 }
  })
  t.mock.method(AuditLogModel as any, 'create', async (payload: any) => ({ ...payload, createdAt: new Date() }))
  registerScreens({
    main: () => ({ photo: './public/main.png', caption: 'main', keyboard: { inline_keyboard: [] } }),
  } as any)
  const ctx: any = {
    from: { id: 42, username: 'volunteer' },
    api: { sendMessage: async (chatId: number) => { if (chatId === -1003775348160) throw new Error('Telegram unavailable') } },
    reply: async () => ({ message_id: 1 }),
    replyWithPhoto: async () => ({ message_id: 2 }),
  }

  await handleConfirmRegistration(ctx, 42)

  assert.equal(storedReg, 'done')
})

test('registration admin keyboard keeps profile and verification without conversation', async () => {
  const { buildAdminKeyboard } = await import('../src/flows/registration/admin.js')
  const buttons = buildAdminKeyboard({ subscriptions: { propresenter: { status: 'pending' } } }, 42).inline_keyboard.flat()
  assert.equal(buttons.some((button: any) => button.callback_data?.startsWith('cv:')), false)
  assert.ok(buttons.some((button: any) => button.callback_data === 'verify:prop:42'))
  assert.ok(buttons.some((button: any) => button.url === 'tg://user?id=42'))
})
