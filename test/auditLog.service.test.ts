import assert from 'node:assert/strict'
import test from 'node:test'

import { AuditLogModel } from '../src/models/AuditLog.js'
import { AuditLogService, auditTopicFor } from '../src/services/auditLog.service.js'

test('createLog persists the event and routes it to the team topic', async (t) => {
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
  assert.equal(notification[0], -1004463392579)
  assert.match(notification[1], /Участник добавлен/)
  assert.equal(notification[2].message_thread_id, 4)
  assert.match(notification[1], /Админ Петров/)
  assert.match(notification[1], /@admin_petrov/)
  assert.match(notification[1], /Иван Иванов/)
  assert.match(notification[1], /@ivan/)
  assert.match(notification[1], /Добавление участника/)

  assert.equal(notification[2].reply_markup, undefined)
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

test('each operational event reaches exactly its configured topic', () => {
  for (const [type, topic] of [
    ['user.first_started', 2], ['user.registration_started', 2], ['user.registered', 2],
    ['team.created', 4], ['team.member_added', 4],
    ['payment.checkout_started', 6], ['payment.created', 6], ['payment.approved', 6], ['payment.rejected', 6],
    ['subscription.reminder_sent', 8], ['subscription.renewed', 8], ['subscription.expired', 8],
    ['access.invite_issued', 10], ['access.group_removed', 10], ['access.group_removal_failed', 10], ['admin.access_added', 10],
    ['user.registration_failed', 2], ['payment.processing_failed', 6], ['subscription.reminder_failed', 8],
  ] as const) assert.equal(auditTopicFor(type), topic, type)
  assert.equal(auditTopicFor('support.message_admin'), null)
  assert.equal(auditTopicFor('support.message_user'), null)
  assert.equal(auditTopicFor('user.profile_updated'), null)
})

test('failed delivery records an error while another topic can still receive the event', async () => {
  const delivered: number[] = []
  const service = new AuditLogService()
  service.setTelegramApi({ sendMessage: async (_chatId: number, _text: string, options: any) => {
    if (options.message_thread_id === 8) throw new Error('Telegram unavailable')
    delivered.push(options.message_thread_id)
    return {} as any
  } } as any)
  const result = await service.notifyAdmins({
    type: 'subscription.reminder_failed', actorType: 'system', targetUserId: 10,
    targetTeamId: 'team', targetSubscriptionId: 'team:product',
    metadata: { reason: 'blocked', expiresAt: new Date('2026-10-01') }, createdAt: new Date(),
  })
  assert.equal(result, true)
  assert.deepEqual(delivered, [12])
})

test('access failure log explains the error and offers safe admin shortcuts', () => {
  const service = new AuditLogService()
  const log: any = {
    type: 'access.group_removal_failed', actorType: 'system',
    targetUserId: 818301762, targetTeamId: '6a7d95eea14b45494fcf36a2',
    metadata: { teamName: 'Media', productId: 'procontent', groupId: -100374992923,
      result: 'доступ ещё не отозван', accessReason: 'подписка закончилась',
      telegramError: 'PARTICIPANT_ID_INVALID', diagnosis: 'Telegram не распознал участника',
      action: 'Проверить членство', attempts: 4,
      nextAttemptAt: new Date('2026-09-28T10:59:58.195Z') },
    createdAt: new Date('2026-09-28T10:43:58.000Z'),
  }
  const message = service.formatLogMessage(log)
  assert.match(message, /Причина отзыва доступа:.*подписка закончилась/)
  assert.match(message, /Ответ Telegram:.*PARTICIPANT_ID_INVALID/)
  assert.match(message, /Что известно:.*Telegram не распознал участника/)
  assert.match(message, /Что проверить:.*Проверить членство/)
  assert.match(message, /Следующая попытка:/)
  assert.doesNotMatch(message, /Стоимость:/)
  const keyboard: any = service.buildLogKeyboard(log)
  const buttons = keyboard.inline_keyboard.flat()
  assert.deepEqual(buttons.filter((button: any) => button.callback_data).map((button: any) => button.callback_data), [
    'ap:u:818301762', 'ap:t:6a7d95eea14b45494fcf36a2', 'ap:t:6a7d95eea14b45494fcf36a2:procontent',
  ])
  assert.equal(buttons.at(-1).url, 'tg://user?id=818301762')
  assert.equal(buttons.some((button: any) => /поддержк|написать/i.test(button.text)), false)
})
