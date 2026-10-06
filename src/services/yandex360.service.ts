import mongoose from 'mongoose'
import { UserModel } from '../models/User.js'
import { Yandex360MemberModel, Yandex360RequestModel, Yandex360StreamModel } from '../models/Yandex360.js'
import { requireAdminPermission } from './adminAccess.service.js'
import { auditLogService } from './auditLog.service.js'

export const validTelegramId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && /^\d+$/.test(String(value))
export const normalizeEmail = (value: string) => value.trim().toLowerCase()
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value)) && value.length <= 254
export function parseYandex360Date(value: string): Date | null {
  const text = value.trim()
  if (text === '-') return null
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  if (!match) throw new Error('Дата: ДД.ММ.ГГГГ, например 28.09.2026. «-» — очистить')
  const [, day, month, year] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Некорректная дата')
  return date
}
const oid = (value: string) => { if (!mongoose.isValidObjectId(value)) throw new Error('Некорректный ID'); return value }
const log = (type: 'yandex360.stream_changed'|'yandex360.member_changed'|'yandex360.member_linked'|'yandex360.email_requested'|'yandex360.email_decided', actor: number, member?: any, metadata: Record<string, unknown> = {}) => auditLogService.createLog({ type, actorType: actor ? 'admin' : 'system', actorTelegramId: actor || null, targetUserId: member?.telegramId || null, metadata: { memberId: member?._id?.toString(), ...metadata }, notify: false })

export async function bindKnownUser(telegramId: number) {
  const user = await UserModel.findOne({ telegramId })
  if (!user) return null
  const member = await Yandex360MemberModel.findOne({ telegramId })
  if (!member) return null
  if (member.userId && String(member.userId) !== String(user._id)) {
    const previousUser = await UserModel.exists({ _id: member.userId })
    if (previousUser) throw new Error('Конфликт привязки Яндекс 360')
    // Пользователя удалили до появления каскадной очистки. Старую подписку
    // нельзя автоматически выдавать новому профилю с тем же Telegram ID.
    await Yandex360RequestModel.deleteMany({ memberId: member._id })
    await Yandex360MemberModel.deleteOne({ _id: member._id, userId: member.userId })
    return null
  }
  if (!member.userId) {
    member.userId = user._id
    await member.save()
    await log('yandex360.member_linked', 0, member)
  }
  return member
}
export async function getMyMembership(telegramId: number) {
  const member = await bindKnownUser(telegramId)
  return member ? { member, stream: await Yandex360StreamModel.findById(member.streamId) } : null
}
export async function createStream(actor: number, name: string) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!name.trim()) throw new Error('Нужно название потока')
  const stream = await Yandex360StreamModel.create({ name: name.trim() })
  await log('yandex360.stream_changed', actor, undefined, { streamId: String(stream._id), action: 'created' })
  return stream
}
export async function updateStream(actor: number, id: string, field: string, raw: string) {
  await requireAdminPermission(actor, 'streams.edit')
  const allowed = ['name','endsAt','chatLink','status','capacity','adminEmail','amount']
  if (!allowed.includes(field)) throw new Error('Недоступное поле')
  let value: any = raw.trim()
  if (field === 'endsAt') value = parseYandex360Date(value)
  if (field === 'capacity' || field === 'amount') { value = Number(value); if (!Number.isFinite(value) || value < 0 || (field === 'capacity' && !Number.isInteger(value))) throw new Error('Некорректное число') }
  if (field === 'status' && !['active','closed'].includes(value)) throw new Error('Статус: active или closed')
  if (field === 'adminEmail' && value && !validEmail(value)) throw new Error('Некорректный email')
  if (field === 'chatLink' && value && !/^https:\/\/t\.me\//.test(value)) throw new Error('Ссылка должна начинаться с https://t.me/')
  if (field === 'status') {
    const current = await Yandex360StreamModel.findById(oid(id))
    if (!current) throw new Error('Поток не найден')
    if (current.status === value) return current
  }
  const stream = await Yandex360StreamModel.findByIdAndUpdate(oid(id), { $set: { [field]: value } }, { new: true, runValidators: true })
  if (!stream) throw new Error('Поток не найден')
  await log('yandex360.stream_changed', actor, undefined, { streamId: id, field })
  return stream
}
export async function createMember(actor: number, input: { name: string, streamId: string, telegramId?: number|null }) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!input.name.trim()) throw new Error('Нужно имя')
  if (input.telegramId != null && !validTelegramId(input.telegramId)) throw new Error('Некорректный Telegram ID')
  const stream = await Yandex360StreamModel.findById(oid(input.streamId))
  if (!stream) throw new Error('Поток не найден')
  const user = input.telegramId ? await UserModel.findOne({ telegramId: input.telegramId }) : null
  const member = await Yandex360MemberModel.create({ name: input.name.trim(), streamId: stream._id, telegramId: input.telegramId || null, userId: user?._id || null })
  await log('yandex360.member_changed', actor, member, { action: 'created' })
  return member
}

/** Назначение из карточки уже зарегистрированного пользователя HUB. */
export async function assignKnownUserToStream(actor: number, telegramId: number, streamId: string) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!validTelegramId(telegramId)) throw new Error('Некорректный Telegram ID')
  const user = await UserModel.findOne({ telegramId })
  if (!user) throw new Error('Пользователь HUB не найден')
  const stream = await Yandex360StreamModel.findById(oid(streamId))
  if (!stream) throw new Error('Поток не найден')
  if (stream.status !== 'active') throw new Error('Поток закрыт для новых участников')

  const existing = await Yandex360MemberModel.findOne({
    $or: [{ telegramId }, { userId: user._id }],
  })
  if (existing) {
    if (String(existing.streamId) === String(stream._id)) return { member: existing, created: false }
    throw new Error('Пользователь уже назначен в другой поток. Перенесите его из карточки участника.')
  }

  if (stream.capacity) {
    const members = await Yandex360MemberModel.find({ streamId: stream._id }).select('seats').lean()
    const occupied = members.reduce((total, member) => total + member.seats, 0)
    if (occupied >= stream.capacity) throw new Error('В потоке закончились свободные места')
  }

  let member: any
  try {
    member = await Yandex360MemberModel.create({
      name: user.fio?.trim() || user.username?.trim() || String(telegramId),
      telegramId, username: user.username || '', userId: user._id,
      streamId: stream._id, seats: 1,
    })
  } catch (error) {
    // Двойное нажатие или параллельное назначение не должно создавать дубликат.
    if ((error as any)?.code !== 11000) throw error
    const current = await Yandex360MemberModel.findOne({ $or: [{ telegramId }, { userId: user._id }] })
    if (current && String(current.streamId) === String(stream._id)) return { member: current, created: false }
    throw new Error('Пользователь уже назначен в другой поток')
  }
  await log('yandex360.member_changed', actor, member, {
    action: 'assigned_from_user_card', streamId: String(stream._id), streamName: stream.name,
  })
  return { member, created: true }
}
export async function updateMember(actor: number, id: string, field: string, raw: string) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!['name','username','seats','amount','note','streamId'].includes(field)) throw new Error('Недоступное поле')
  let value: any = raw.trim()
  if (field === 'seats' || field === 'amount') { value = Number(value); if (!Number.isFinite(value) || value < (field === 'seats' ? 1 : 0) || (field === 'seats' && !Number.isInteger(value))) throw new Error('Некорректное число') }
  if (field === 'streamId' && !(await Yandex360StreamModel.exists({ _id: oid(value) }))) throw new Error('Поток не найден')
  const member = await Yandex360MemberModel.findByIdAndUpdate(oid(id), { $set: { [field]: value } }, { new: true, runValidators: true })
  if (!member) throw new Error('Участник не найден')
  await log('yandex360.member_changed', actor, member, { field })
  return member
}
export async function linkMember(actor: number, id: string, telegramId: number) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!validTelegramId(telegramId)) throw new Error('Некорректный Telegram ID')
  const member = await Yandex360MemberModel.findById(oid(id))
  if (!member) throw new Error('Участник не найден')
  if (member.telegramId && member.telegramId !== telegramId) throw new Error('Участник уже привязан к другому ID')
  const existing = await Yandex360MemberModel.exists({ telegramId, _id: { $ne: member._id } })
  if (existing) throw new Error('Telegram ID уже привязан')
  const user = await UserModel.findOne({ telegramId })
  member.telegramId = telegramId; member.userId = user?._id || null
  await member.save()
  await log('yandex360.member_linked', actor, member)
  return member
}
export async function requestEmail(telegramId: number, proposed: string, oldEmailId?: string) {
  if (!validEmail(proposed)) throw new Error('Некорректный email')
  const member = await bindKnownUser(telegramId)
  if (!member) throw new Error('Подписка не найдена')
  const address = normalizeEmail(proposed)
  if (member.emails.some((e: any) => e.address === address && ['pending','connected'].includes(e.status))) throw new Error('Адрес уже добавлен')
  if (oldEmailId && !member.emails.some((e: any) => String(e._id) === oldEmailId && e.status === 'connected')) throw new Error('Адрес для замены не найден')
  const pending = await Yandex360RequestModel.findOne({ memberId: member._id, proposedEmail: address, status: 'pending' })
  if (pending) return pending
  const request = await Yandex360RequestModel.create({ memberId: member._id, streamId: member.streamId, oldEmailId: oldEmailId ? oid(oldEmailId) : null, proposedEmail: address })
  member.emails.push({ address, status: 'pending' } as any)
  await member.save()
  await log('yandex360.email_requested', 0, member, { requestId: String(request._id) })
  return request
}
export async function decideEmail(actor: number, id: string, approve: boolean) {
  await requireAdminPermission(actor, 'requests.edit')
  const request = await Yandex360RequestModel.findOneAndUpdate({ _id: oid(id), status: 'pending' }, { $set: { status: approve ? 'approved' : 'rejected', decidedBy: actor, decidedAt: new Date() } }, { new: true })
  if (!request) return { changed: false, member: null }
  const member = await Yandex360MemberModel.findById(request.memberId)
  if (!member) throw new Error('Участник не найден')
  const email = member.emails.find((e: any) => e.address === request.proposedEmail && e.status === 'pending')
  if (email) { email.status = approve ? 'connected' : 'rejected'; email.decidedBy = actor; email.decidedAt = new Date() }
  if (approve && request.oldEmailId) {
    const old = member.emails.id(request.oldEmailId)
    if (old?.status === 'connected') { old.status = 'disconnected'; old.decidedBy = actor; old.decidedAt = new Date() }
  }
  await member.save()
  await log('yandex360.email_decided', actor, member, { requestId: id, decision: approve ? 'approved' : 'rejected' })
  return { changed: true, member }
}

export async function addAdminEmail(actor: number, memberId: string, address: string) {
  await requireAdminPermission(actor, 'streams.edit')
  if (!validEmail(address)) throw new Error('Некорректный email')
  const member = await Yandex360MemberModel.findById(oid(memberId))
  if (!member) throw new Error('Участник не найден')
  const normalized = normalizeEmail(address)
  if (member.emails.some((e: any) => e.address === normalized && ['pending','connected'].includes(e.status))) throw new Error('Адрес уже добавлен')
  member.emails.push({ address: normalized, status: 'pending' } as any)
  await member.save()
  await log('yandex360.email_requested', actor, member, { action: 'admin_added' })
  return member
}

export async function setAdminEmailStatus(actor: number, memberId: string, emailId: string, action: 'approve'|'reject'|'disable') {
  await requireAdminPermission(actor, 'streams.edit')
  const member = await Yandex360MemberModel.findById(oid(memberId))
  if (!member) throw new Error('Участник не найден')
  const email = member.emails.id(oid(emailId))
  const expected = action === 'disable' ? 'connected' : 'pending'
  if (!email || email.status !== expected) return { changed: false, member }
  email.status = action === 'approve' ? 'connected' : action === 'reject' ? 'rejected' : 'disconnected'
  email.decidedBy = actor; email.decidedAt = new Date()
  await member.save()
  await log('yandex360.email_decided', actor, member, { action })
  return { changed: true, member }
}
