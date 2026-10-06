import { InlineKeyboard, type Api } from 'grammy'
import {
  AuditLogModel,
  type AuditActorType,
  type AuditLogRecord,
  type AuditLogType,
  type AuditMetadata,
} from '../models/AuditLog.js'
import { UserModel } from '../models/User.js'
import { TeamModel } from '../models/Team.js'
import { getProduct } from '../config/products.js'
import { LOG_GROUP_ID, LOG_THREADS } from '../config/logs.js'
import { apCb, TEAM_PRODUCT_IDS } from '../constants/admin-panel.js'

const TYPE_LABELS: Record<AuditLogType, { emoji: string; title: string }> = {
  'user.first_started': { emoji: '👋', title: 'Первый запуск бота' },
  'user.registration_started': { emoji: '📝', title: 'Регистрация начата' },
  'user.registration_failed': { emoji: '⚠️', title: 'Ошибка регистрации' },
  'user.registered': { emoji: '🆕', title: 'Регистрация пользователя' },
  'user.profile_updated': { emoji: '✏️', title: 'Профиль изменён' },
  'user.deleted': { emoji: '🗑', title: 'Пользователь удалён' },
  'team.created': { emoji: '👥', title: 'Команда создана' },
  'team.deleted': { emoji: '🗑', title: 'Команда удалена' },
  'team.member_added': { emoji: '➕', title: 'Участник добавлен' },
  'team.member_removed': { emoji: '➖', title: 'Участник удалён' },
  'team.updated': { emoji: '✏️', title: 'Команда изменена' },
  'subscription.reminder_sent': { emoji: '🔔', title: 'Напоминание отправлено через Telegram API' },
  'subscription.reminder_failed': { emoji: '⚠️', title: 'Напоминание не отправлено' },
  'subscription.created': { emoji: '🧾', title: 'Подписка создана' },
  'subscription.activated': { emoji: '✅', title: 'Подписка активирована' },
  'subscription.renewed': { emoji: '🔄', title: 'Подписка продлена' },
  'subscription.expired': { emoji: '⌛️', title: 'Подписка закончилась' },
  'subscription.disabled': { emoji: '⛔️', title: 'Подписка отключена' },
  'payment.checkout_started': { emoji: '🛒', title: 'Оформление заказа начато' },
  'payment.processing_failed': { emoji: '⚠️', title: 'Ошибка обработки платежа' },
  'payment.created': { emoji: '💳', title: 'Платёж создан' },
  'payment.receipt_submitted': { emoji: '🧾', title: 'Чек отправлен' },
  'payment.approved': { emoji: '✅', title: 'Платёж подтверждён' },
  'payment.rejected': { emoji: '❌', title: 'Платёж отклонён' },
  'support.message_user': { emoji: '💬', title: 'Сообщение пользователя в поддержку' },
  'support.message_admin': { emoji: '💬', title: 'Ответ поддержки' },
  'support.auto_closed': { emoji: '🔒', title: 'Обращение закрыто автоматически' },
  'access.invite_issued': { emoji: '🔑', title: 'Ссылка для доступа выдана' },
  'access.group_removed': { emoji: '🚫', title: 'Пользователь удалён из группы' },
  'access.group_retained': { emoji: '✅', title: 'Доступ сохранён через другую команду' },
  'access.group_restored': { emoji: '🔓', title: 'Доступ в группу восстановлен' },
  'access.group_removal_failed': { emoji: '⚠️', title: 'Не удалось удалить пользователя из группы' },
  'access.join_denied': { emoji: '⛔️', title: 'Заявка в группу отклонена' },
  'access.join_removed': { emoji: '🚫', title: 'Вступление без подписки остановлено' },
  'admin.access_added': { emoji: '👮', title: 'Доступ администратора добавлен' },
  'admin.access_updated': { emoji: '👮', title: 'Доступ администратора изменён' },
  'admin.role_changed': { emoji: '🔄', title: 'Роль администратора изменена' },
  'admin.permission_changed': { emoji: '🔐', title: 'Право администратора изменено' },
  'admin.access_disabled': { emoji: '⛔️', title: 'Доступ администратора отключён' },
  'propresenter.request_title_changed': { emoji: '✏️', title: 'Название заявок изменено' },
  'propresenter.stream_created': { emoji: '🎬', title: 'Поток ProPresenter создан' },
  'propresenter.stream_date_changed': { emoji: '📅', title: 'Дата потока изменена' },
  'propresenter.team_added': { emoji: '📡', title: 'Команда добавлена в поток' },
  'yandex360.stream_changed': { emoji: '📅', title: 'Поток Яндекс 360 изменён' },
  'yandex360.member_changed': { emoji: '👤', title: 'Участник Яндекс 360 изменён' },
  'yandex360.member_linked': { emoji: '🔗', title: 'Участник Яндекс 360 привязан' },
  'yandex360.email_requested': { emoji: '✉️', title: 'Заявка Яндекс 360 создана' },
  'yandex360.email_decided': { emoji: '✅', title: 'Заявка Яндекс 360 рассмотрена' },
}

const ACTOR_LABELS: Record<AuditActorType, string> = {
  user: 'пользователь',
  admin: 'администратор',
  system: 'система',
}

export type CreateAuditLogInput = {
  type: AuditLogType
  actorType: AuditActorType
  actorTelegramId?: number | null
  targetUserId?: number | null
  targetTeamId?: string | null
  targetSubscriptionId?: string | null
  targetPaymentId?: string | null
  metadata?: AuditMetadata
  notify?: boolean
}

export type AuditActor = Pick<CreateAuditLogInput, 'actorType' | 'actorTelegramId'>

type TelegramApi = Pick<Api, 'sendMessage'>

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function metadataLine(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  return `${label}: <b>${escapeHtml(value)}</b>`
}

function usernameText(value: unknown): string | null {
  const username = String(value ?? '').trim().replace(/^@/, '')
  if (!username || username === 'нету' || username === 'не указано') return null
  return `@${username}`
}

function dateText(value: unknown, includeTime = false): string | null {
  if (!value) return null
  const date = new Date(value as any)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    ...(includeTime
      ? {}
      : ({ day: '2-digit', month: '2-digit', year: 'numeric' } as const)),
  })
}

function priceText(metadata: AuditMetadata): string | null {
  const values: string[] = []
  if (typeof metadata.productPriceRub === 'number') values.push(`${metadata.productPriceRub} ₽`)
  if (typeof metadata.productPriceUsd === 'number') values.push(`${metadata.productPriceUsd} $`)
  return values.length ? values.join(' / ') : null
}

export function buildSubscriptionTargetId(teamId: string, productId: string): string {
  return `${teamId}:${productId}`
}

export function auditTopicFor(type: AuditLogType): number | null {
  if (type.startsWith('support.') || type.startsWith('propresenter.')) return null
  if (type === 'user.profile_updated') return null
  if (type === 'user.deleted' || type.startsWith('admin.') || type.startsWith('access.')) return LOG_THREADS.access
  if (type.startsWith('user.')) return LOG_THREADS.registration
  if (type.startsWith('team.')) return LOG_THREADS.teams
  if (type.startsWith('payment.')) return LOG_THREADS.orders
  if (type.startsWith('subscription.')) return LOG_THREADS.subscriptions
  return null
}

export class AuditLogService {
  private telegramApi?: TelegramApi

  setTelegramApi(api: TelegramApi) {
    this.telegramApi = api
  }

  private async enrichMetadata(input: CreateAuditLogInput): Promise<AuditMetadata> {
    const metadata: AuditMetadata = { ...(input.metadata || {}) }
    metadata.teamOwnerTelegramId ??= metadata.ownerTelegramId
    const productId = typeof metadata.productId === 'string' ? metadata.productId : undefined
    const product = productId ? getProduct(productId) : undefined

    if (product) {
      metadata.productName ??= product.name
      metadata.productPriceRub ??= product.priceRub
      metadata.productPriceUsd ??= product.priceUsd
    }

    // В тестах и до connectDB() запросы обогащения не запускаем. Сама запись
    // аудита по-прежнему выполняется обычным create() и остаётся обязательной.
    if (AuditLogModel.db.readyState !== 1) return metadata

    try {
      const team = input.targetTeamId
        ? await TeamModel.findById(input.targetTeamId)
            .select({ name: 1, ownerId: 1, members: 1 })
            .lean()
        : null

      if (team) {
        metadata.teamName ??= team.name
        metadata.teamOwnerTelegramId ??= team.ownerId
        metadata.teamMemberCount ??= team.members?.length || 0
      }

      const userIds = new Set<number>()
      if (input.actorTelegramId) userIds.add(input.actorTelegramId)
      if (input.targetUserId) userIds.add(input.targetUserId)
      const teamOwnerTelegramId = Number(metadata.teamOwnerTelegramId)
      if (Number.isSafeInteger(teamOwnerTelegramId) && teamOwnerTelegramId > 0) {
        userIds.add(teamOwnerTelegramId)
      }

      if (userIds.size) {
        const users = await UserModel.find({ telegramId: { $in: [...userIds] } })
          .select({ telegramId: 1, fio: 1, username: 1, city: 1, church: 1 })
          .lean()
        const byTelegramId = new Map(users.map((user) => [user.telegramId, user]))
        const actor = input.actorTelegramId
          ? byTelegramId.get(input.actorTelegramId)
          : undefined
        const target = input.targetUserId ? byTelegramId.get(input.targetUserId) : undefined
        const owner = byTelegramId.get(teamOwnerTelegramId)

        metadata.actorFio ??= actor?.fio
        metadata.actorUsername ??= actor?.username
        metadata.targetUserFio ??= target?.fio || metadata.userName
        metadata.targetUserUsername ??= target?.username || metadata.username
        metadata.targetUserCity ??= target?.city
        metadata.targetUserChurch ??= target?.church
        metadata.teamOwnerFio ??= owner?.fio
        metadata.teamOwnerUsername ??= owner?.username
      }
    } catch (error) {
      // Снимок с переданными бизнес-данными ценнее, чем отсутствие лога из-за
      // необязательного lookup. Ошибку оставляем видимой в stderr.
      console.error('Audit metadata enrichment failed:', error)
    }

    return metadata
  }

  async createLog(input: CreateAuditLogInput) {
    const metadata = await this.enrichMetadata(input)
    const log = await AuditLogModel.create({
      type: input.type,
      actorType: input.actorType,
      actorTelegramId: input.actorTelegramId ?? null,
      targetUserId: input.targetUserId ?? null,
      targetTeamId: input.targetTeamId ?? null,
      targetSubscriptionId: input.targetSubscriptionId ?? null,
      targetPaymentId: input.targetPaymentId ?? null,
      metadata,
    })

    if (input.notify !== false) {
      await this.notifyAdmins(log).catch((error) => {
        console.error('Audit log Telegram notification failed:', error)
      })
    }

    return log
  }

  formatLogMessage(log: Pick<AuditLogRecord, keyof AuditLogRecord>): string {
    const view = TYPE_LABELS[log.type]
    const metadata = log.metadata || {}
    const actorUsername = usernameText(metadata.actorUsername)
    const targetUsername = usernameText(metadata.targetUserUsername || metadata.username)
    const ownerUsername = usernameText(metadata.teamOwnerUsername)
    const targetUserFio = metadata.targetUserFio || metadata.userName
    const actorLines =
      log.actorType === 'system'
        ? ['Роль: <b>система</b>']
        : [
            `Роль: <b>${ACTOR_LABELS[log.actorType]}</b>`,
            metadataLine('ФИО', metadata.actorFio),
            metadataLine('Username', actorUsername),
            log.actorTelegramId
              ? `Telegram ID: <code>${escapeHtml(log.actorTelegramId)}</code>`
              : null,
          ]

    const objectLines: Array<string | null> = []
    if (log.targetUserId) {
      objectLines.push(
        '👤 <b>Пользователь</b>',
        metadataLine('ФИО', targetUserFio),
        metadataLine('Username', targetUsername),
        `Telegram ID: <code>${escapeHtml(log.targetUserId)}</code>`,
        metadataLine('Город', metadata.targetUserCity || metadata.city),
        metadataLine('Церковь', metadata.targetUserChurch || metadata.church)
      )
    }
    if (log.targetTeamId) {
      if (objectLines.length) objectLines.push('')
      objectLines.push(
        '👥 <b>Команда</b>',
        metadataLine('Название', metadata.teamName),
        `Team ID: <code>${escapeHtml(log.targetTeamId)}</code>`,
        metadataLine('Владелец', metadata.teamOwnerFio),
        metadataLine('Username владельца', ownerUsername),
        metadata.teamOwnerTelegramId
          ? `ID владельца: <code>${escapeHtml(metadata.teamOwnerTelegramId)}</code>`
          : null,
        metadataLine('Участников', metadata.teamMemberCount)
      )
    }
    if (log.targetPaymentId) {
      if (objectLines.length) objectLines.push('')
      objectLines.push(
        '💳 <b>Платёж</b>',
        `Payment ID: <code>${escapeHtml(log.targetPaymentId)}</code>`
      )
    }
    if (log.targetSubscriptionId) {
      if (objectLines.length) objectLines.push('')
      objectLines.push(
        '📦 <b>Подписка</b>',
        `Subscription ID: <code>${escapeHtml(log.targetSubscriptionId)}</code>`
      )
    }

    const detailLines: Array<string | null> = [
      metadataLine('Продукт', metadata.productName || metadata.productId),
      ...(log.type.startsWith('access.') ? [] : [metadataLine('Стоимость', priceText(metadata))]),
      metadataLine('Способ оплаты', metadata.method),
      metadataLine('Тип операции', metadata.operation),
      metadataLine('Результат', metadata.result || metadata.status || 'выполнено'),
      metadataLine('Group ID', metadata.groupId),
      metadataLine('Попыток', metadata.attempts),
      metadataLine('Причина отзыва доступа', metadata.accessReason),
      metadataLine('Ответ Telegram', metadata.telegramError),
      metadataLine('Статус участника', metadata.memberStatus),
      metadataLine('Что известно', metadata.diagnosis),
      metadataLine('Что проверить', metadata.action),
      metadataLine('Следующая попытка', metadata.nextAttemptAt ? `${dateText(metadata.nextAttemptAt, true)} МСК` : null),
      metadataLine('Order ID', metadata.orderId),
      metadataLine('Поле', metadata.field),
      metadataLine('Было', metadata.previousValue ?? metadata.previousStatus),
      metadataLine('Стало', metadata.newValue ?? metadata.status),
      metadataLine('Изменение', metadata.change),
      metadataLine('Поток', metadata.flowNumber ? `№${metadata.flowNumber}` : null),
      metadataLine('Предыдущая дата', dateText(metadata.previousExpiresAt)),
      metadataLine('Дата окончания', dateText(metadata.expiresAt)),
      metadataLine('Участник', metadata.memberTelegramId),
      metadataLine('Причина', metadata.reason || metadata.rejectionReason),
    ]

    const lines = [
      `${view.emoji} <b>${view.title}</b>`,
      '━━━━━━━━━━━━━━',
      '<b>Кто выполнил</b>',
      ...actorLines,
      '',
      ...(objectLines.length ? ['<b>Объекты события</b>', ...objectLines, ''] : []),
      ...(detailLines.some(Boolean)
        ? ['<b>Детали</b>', ...detailLines.filter((line): line is string => Boolean(line)), '']
        : []),
      '━━━━━━━━━━━━━━',
      `🕒 <b>${dateText(log.createdAt, true)} МСК</b>`,
    ]

    return lines.filter((line): line is string => line !== null).join('\n')
  }

  async notifyAdmins(log: Pick<AuditLogRecord, keyof AuditLogRecord>) {
    if (!this.telegramApi) return false

    const topicId = auditTopicFor(log.type)
    if (!topicId) return false
    const groupId = LOG_GROUP_ID
    const message = this.formatLogMessage(log)
    const keyboard = this.buildLogKeyboard(log)
    const needsErrorTopic = log.type === 'user.registration_failed' ||
      log.type === 'payment.processing_failed' || log.type === 'subscription.reminder_failed' ||
      log.type === 'access.group_removal_failed'
    const topics = needsErrorTopic ? [topicId, LOG_THREADS.errors] : [topicId]
    const results = await Promise.allSettled(topics.map((message_thread_id) =>
      this.telegramApi!.sendMessage(groupId, message, {
        parse_mode: 'HTML', message_thread_id,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      })
    ))
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') console.error(`Audit Telegram delivery failed for topic ${topics[index]}:`, result.reason)
    }
    return results.some((result) => result.status === 'fulfilled')
  }

  buildLogKeyboard(log: Pick<AuditLogRecord, keyof AuditLogRecord>): InlineKeyboard | null {
    if (!log.type.startsWith('access.') && !['subscription.expired', 'subscription.disabled'].includes(log.type)) return null
    const keyboard = new InlineKeyboard()
    let hasButtons = false
    if (log.targetUserId) {
      keyboard.text('👤 Профиль и управление', apCb('u', log.targetUserId)).row()
      hasButtons = true
    }
    if (log.targetTeamId && /^[a-f\d]{24}$/i.test(log.targetTeamId)) {
      keyboard.text(`👥 Команда «${String(log.metadata?.teamName || 'открыть')}»`.slice(0, 60),
        apCb('t', log.targetTeamId)).row()
      hasButtons = true
      const productId = log.metadata?.productId
      if (typeof productId === 'string' && (TEAM_PRODUCT_IDS as readonly string[]).includes(productId)) {
        keyboard.text('📦 Подписка команды', apCb('t', log.targetTeamId, productId)).row()
      }
    }
    if (log.targetUserId) keyboard.url('✉️ Открыть Telegram-профиль', `tg://user?id=${log.targetUserId}`)
    return hasButtons ? keyboard : null
  }
}

export const auditLogService = new AuditLogService()

/** Best-effort operational event; a logging outage must not stop a user action. */
export async function recordOperationalEvent(input: CreateAuditLogInput): Promise<void> {
  try {
    await auditLogService.createLog(input)
  } catch (error) {
    console.error(`Operational audit persistence failed (${input.type}):`, error)
  }
}
