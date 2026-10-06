import { ADMIN_PERMISSION_META, type AdminPermissionKey, type AdminRole } from '../constants/admin-access.js'
import { AdminAccessModel } from '../models/AdminAccess.js'
import { auditLogService } from './auditLog.service.js'

export const ADMIN_PERMISSIONS = Object.keys(ADMIN_PERMISSION_META) as AdminPermissionKey[]
export type AdminPermission = AdminPermissionKey
export const CONSULTANT_PERMISSIONS = ADMIN_PERMISSIONS.filter((permission) => permission.endsWith('.view'))
export const ADMIN_PERMISSION_DEPENDENCIES: Partial<Record<AdminPermission, AdminPermission>> = {
  'users.edit': 'users.view', 'teams.edit': 'teams.view', 'subscriptions.edit': 'subscriptions.view',
  'payments.manage': 'payments.view', 'streams.edit': 'streams.view', 'requests.edit': 'requests.view',
  'support.reply': 'support.view', 'admins.manage': 'admins.view',
  'tutorials.edit': 'tutorials.view',
}
export type ResolvedAdminAccess = { telegramId: number; role: AdminRole; permissions: AdminPermission[]; bootstrap: boolean; active: boolean }

function bootstrapAdminIds() { return (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Number.isSafeInteger) }
export function normalizeAdminPermissions(values: readonly string[]) {
  const normalized = new Set(values.filter((value): value is AdminPermission => value in ADMIN_PERMISSION_META))
  for (const permission of [...normalized]) {
    const dependency = ADMIN_PERMISSION_DEPENDENCIES[permission]
    if (dependency) normalized.add(dependency)
  }
  return ADMIN_PERMISSIONS.filter((permission) => normalized.has(permission))
}
export function applyAdminPermissionChange(current: readonly string[], permission: AdminPermission, enabled: boolean) {
  const next = new Set(normalizeAdminPermissions(current))
  if (enabled) {
    next.add(permission)
    const dependency = ADMIN_PERMISSION_DEPENDENCIES[permission]
    if (dependency) next.add(dependency)
  } else {
    next.delete(permission)
    for (const [mutation, view] of Object.entries(ADMIN_PERMISSION_DEPENDENCIES)) {
      if (view === permission) next.delete(mutation as AdminPermission)
    }
  }
  return ADMIN_PERMISSIONS.filter((item) => next.has(item))
}

export async function getAdminAccess(telegramId: number): Promise<ResolvedAdminAccess | null> {
  if (bootstrapAdminIds().includes(telegramId)) return { telegramId, role: 'superadmin', permissions: [...ADMIN_PERMISSIONS], bootstrap: true, active: true }
  if (AdminAccessModel.db.readyState !== 1) return null
  const record = await AdminAccessModel.findOne({ telegramId, active: true }).lean()
  if (!record) return null
  const role = record.role as AdminRole
  return { telegramId, role, bootstrap: false, active: true, permissions: role === 'superadmin' ? [...ADMIN_PERMISSIONS] : role === 'consultant' ? [...CONSULTANT_PERMISSIONS] : normalizeAdminPermissions(record.permissions) }
}
export async function isSuperAdmin(telegramId: number) { return (await getAdminAccess(telegramId))?.role === 'superadmin' }
export async function isAdmin(telegramId: number) { return Boolean(await getAdminAccess(telegramId)) }
export async function hasAdminPermission(telegramId: number, permission: AdminPermission) {
  const access = await getAdminAccess(telegramId)
  return access?.role === 'superadmin' || Boolean(access?.permissions.includes(permission))
}
export class AdminPermissionError extends Error { constructor() { super('Недостаточно прав для выполнения этого действия.') } }
export async function requireAdminPermission(telegramId: number, permission: AdminPermission) {
  if (!(await hasAdminPermission(telegramId, permission))) throw new AdminPermissionError()
}
export async function listAdminAccess() {
  const records = await AdminAccessModel.find().sort({ createdAt: 1 })
  return [...bootstrapAdminIds().map((telegramId) => ({ telegramId, role: 'superadmin' as const, permissions: [...ADMIN_PERMISSIONS], active: true, bootstrap: true })), ...records.map((record) => ({ ...record.toObject(), role: record.role as AdminRole, bootstrap: false }))]
}
async function requireCanManage(actorId: number, targetId: number, targetRole?: AdminRole, desiredRole?: AdminRole) {
  const actor = await getAdminAccess(actorId)
  if (!actor) throw new AdminPermissionError()
  if (targetRole === 'superadmin' || desiredRole === 'superadmin') {
    if (actor.role !== 'superadmin') throw new AdminPermissionError()
    if (targetRole === 'superadmin' && actorId === targetId) throw new Error('Суперадмин не может изменить собственный максимальный доступ')
  } else if (actor.role !== 'superadmin' && !actor.permissions.includes('admins.manage')) throw new AdminPermissionError()
}
export async function upsertAdminAccess(input: { telegramId: number; role: AdminRole; permissions?: string[]; actorId: number }) {
  if (bootstrapAdminIds().includes(input.telegramId)) throw new Error('Bootstrap SUPERADMIN нельзя изменить')
  const before = await AdminAccessModel.findOne({ telegramId: input.telegramId }).lean()
  await requireCanManage(input.actorId, input.telegramId, before?.role as AdminRole | undefined, input.role)
  const permissions = input.role === 'admin' ? normalizeAdminPermissions(input.permissions || []) : []
  const record = await AdminAccessModel.findOneAndUpdate({ telegramId: input.telegramId }, { $set: { role: input.role, permissions, active: true }, $setOnInsert: { addedBy: input.actorId } }, { upsert: true, new: true, runValidators: true })
  await auditLogService.createLog({ type: before ? 'admin.role_changed' : 'admin.access_added', actorType: 'admin', actorTelegramId: input.actorId, targetUserId: input.telegramId, metadata: before ? { oldRole: before.role, newRole: input.role } : { role: input.role } })
  return record
}
export async function setAdminPermission(input: { telegramId: number; permission: AdminPermission; enabled: boolean; actorId: number }) {
  const before = await AdminAccessModel.findOne({ telegramId: input.telegramId, active: true }).lean()
  if (!before || before.role !== 'admin') throw new Error('Права настраиваются только для роли ADMIN')
  await requireCanManage(input.actorId, input.telegramId, 'admin')
  const oldValue = before.permissions.includes(input.permission)
  const permissions = applyAdminPermissionChange(before.permissions, input.permission, input.enabled)
  const record = await AdminAccessModel.findOneAndUpdate({ telegramId: input.telegramId, role: 'admin', active: true }, { $set: { permissions } }, { new: true })
  await auditLogService.createLog({ type: 'admin.permission_changed', actorType: 'admin', actorTelegramId: input.actorId, targetUserId: input.telegramId, metadata: { permission: input.permission, oldValue, newValue: input.enabled } })
  return record
}
export async function disableAdminAccess(telegramId: number, actorId: number) {
  if (bootstrapAdminIds().includes(telegramId)) throw new Error('Bootstrap SUPERADMIN нельзя отключить')
  const before = await AdminAccessModel.findOne({ telegramId, active: true }).lean()
  if (!before) return null
  await requireCanManage(actorId, telegramId, before.role as AdminRole)
  const record = await AdminAccessModel.findOneAndUpdate({ telegramId, active: true }, { $set: { active: false } }, { new: true })
  if (record) await auditLogService.createLog({ type: 'admin.access_disabled', actorType: 'admin', actorTelegramId: actorId, targetUserId: telegramId, metadata: { role: record.role } })
  return record
}
