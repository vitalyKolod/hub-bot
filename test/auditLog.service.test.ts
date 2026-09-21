import assert from 'node:assert/strict'
import test from 'node:test'

import { AuditLogModel } from '../src/models/AuditLog.js'
import { AuditLogService } from '../src/services/auditLog.service.js'

test('createLog persists the event and sends it to the audit topic with existing callbacks', async (t) => {
  const createdAt = new Date('2026-09-04T12:34:56.000Z')
  let persisted: any
  let notification: any

  t.mock.method(AuditLogModel as any, 'create', async (payload: any) => {
    persisted = payload
    return { ...payload, createdAt }
  })

  const service = new AuditLogService()
  service.setTelegramApi({
    sendMessage: async (...args: any[]) => {
      notification = args
      return {} as any
    },
  } as any)

  await service.createLog({
    type: 'team.member_added',
    actorType: 'admin',
    actorTelegramId: 111,
    targetUserId: 222,
    targetTeamId: '507f1f77bcf86cd799439011',
    metadata: {
      actorFio: 'Админ Петров',
      actorUsername: 'admin_petrov',
      targetUserFio: 'Иван Иванов',
      targetUserUsername: 'ivan',
      teamName: 'Media Team',
      teamOwnerTelegramId: 222,
      productId: 'add_member',
      method: 'Рубли — СБП',
    },
  })

  assert.equal(persisted.type, 'team.member_added')
  assert.equal(persisted.actorType, 'admin')
  assert.equal(persisted.actorTelegramId, 111)
  assert.equal(notification[0], -1004436462979)
  assert.match(notification[1], /Участник добавлен/)
  assert.equal(notification[2].message_thread_id, 390)
  assert.match(notification[1], /Админ Петров/)
  assert.match(notification[1], /@admin_petrov/)
  assert.match(notification[1], /Иван Иванов/)
  assert.match(notification[1], /@ivan/)
  assert.match(notification[1], /Добавление участника/)

  const buttons = notification[2].reply_markup.inline_keyboard.flat()
  assert.deepEqual(
    buttons.filter((button: any) => button.callback_data).map((button: any) => button.callback_data),
    ['support:profile:222', 'support:team:507f1f77bcf86cd799439011']
  )
  assert.equal(buttons.find((button: any) => button.url)?.url, 'tg://user?id=222')
  for (const button of buttons.filter((item: any) => item.callback_data)) {
    assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64)
  }
})

test('formatLogMessage escapes snapshots used in Telegram HTML', () => {
  const service = new AuditLogService()
  const text = service.formatLogMessage({
    type: 'user.profile_updated',
    actorType: 'user',
    actorTelegramId: 123,
    targetUserId: 123,
    targetTeamId: null,
    targetSubscriptionId: null,
    targetPaymentId: null,
    metadata: { userName: '<Иван & Мария>', change: 'город изменён' },
    createdAt: new Date('2026-09-04T12:34:56.000Z'),
  })

  assert.match(text, /&lt;Иван &amp; Мария&gt;/)
  assert.doesNotMatch(text, /<Иван/)
})
