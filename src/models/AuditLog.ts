import mongoose from 'mongoose'

export const AUDIT_ACTOR_TYPES = ['user', 'admin', 'system'] as const

export const AUDIT_LOG_TYPES = [
  'user.first_started',
  'user.registration_started',
  'user.registration_failed',
  'user.registered',
  'user.profile_updated',
  'user.deleted',
  'team.device_replaced',
  'team.device_added',
  'team.device_released',
  'team.device_requested',
  'team.device_decided',
  'team.created',
  'team.deleted',
  'team.member_added',
  'team.member_removed',
  'team.updated',
  'subscription.reminder_sent',
  'subscription.reminder_failed',
  'subscription.created',
  'subscription.activated',
  'subscription.renewed',
  'subscription.expired',
  'subscription.disabled',
  'payment.checkout_started',
  'payment.processing_failed',
  'payment.created',
  'payment.receipt_submitted',
  'payment.approved',
  'payment.rejected',
  'support.message_user',
  'support.message_admin',
  'support.auto_closed',
  'access.invite_issued',
  'access.group_removed',
  'access.group_retained',
  'access.group_restored',
  'access.group_removal_failed',
  'access.join_denied',
  'access.join_removed',
  'admin.access_added',
  'admin.access_updated',
  'admin.role_changed',
  'admin.permission_changed',
  'admin.access_disabled',
  'propresenter.request_title_changed',
  'propresenter.stream_created',
  'propresenter.stream_date_changed',
  'propresenter.team_added',
  'yandex360.stream_changed',
  'yandex360.member_changed',
  'yandex360.member_linked',
  'yandex360.email_requested',
  'yandex360.email_decided',
] as const

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]
export type AuditLogType = (typeof AUDIT_LOG_TYPES)[number]

export type AuditMetadata = Record<string, unknown>

export interface AuditLogRecord {
  type: AuditLogType
  actorType: AuditActorType
  actorTelegramId?: number | null
  targetUserId?: number | null
  targetTeamId?: string | null
  targetSubscriptionId?: string | null
  targetPaymentId?: string | null
  metadata: AuditMetadata
  createdAt: Date
}

const auditLogSchema = new mongoose.Schema<AuditLogRecord>(
  {
    type: { type: String, enum: AUDIT_LOG_TYPES, required: true, index: true },
    actorType: { type: String, enum: AUDIT_ACTOR_TYPES, required: true, index: true },
    actorTelegramId: { type: Number, default: null, index: true },
    targetUserId: { type: Number, default: null, index: true },
    targetTeamId: { type: String, default: null, index: true },
    targetSubscriptionId: { type: String, default: null, index: true },
    targetPaymentId: { type: String, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  {
    versionKey: false,
    // Аудит не должен незаметно ждать в памяти при недоступной базе.
    // Ошибка записи возвращается вызывающему бизнес-сценарию немедленно.
    bufferCommands: false,
  }
)

auditLogSchema.index({ targetUserId: 1, createdAt: -1 })
auditLogSchema.index({ targetTeamId: 1, createdAt: -1 })
auditLogSchema.index({ targetSubscriptionId: 1, createdAt: -1 })
auditLogSchema.index({ targetPaymentId: 1, createdAt: -1 })
auditLogSchema.index({ type: 1, createdAt: -1 })

export const AuditLogModel = mongoose.model<AuditLogRecord>('AuditLog', auditLogSchema)
