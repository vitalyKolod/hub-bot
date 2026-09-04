// services/adminPanel.service.ts
// Сервисный слой админ-панели. Переиспользует существующие модели напрямую,
// существующие team.service.ts / user.service.ts не трогает и не ломает.

import { UserModel } from '../models/User.js'
import { TeamModel } from '../models/Team.js'
import { CartModel } from '../models/Cart.js'
import { TeamInviteModel } from '../models/TeamInvite.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { ProPresenterWaitlistModel } from '../models/ProPresenterWaitlist.js'
import { SupportTicketModel } from '../models/SupportTicket.js'
import { PAGE_SIZE, SUB_STATUSES } from '../constants/admin-panel.js'

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Mongoose-сабдокумент -> обычный plain-объект. Без этого спред {...sub}
 * теряет поля (status/expiresAt/meta), т.к. спред берёт только "свои"
 * enumerable-свойства, а не то, что отдают геттеры сабдокумента. */
function toPlainSub(sub: any): any {
  if (!sub) return sub
  return sub.toObject ? sub.toObject() : sub
}

// ==================== САНАЦИЯ БИТЫХ ДАННЫХ ====================
// В "боевой" базе иногда встречаются подписки с некорректным значением status
// (лишние пробелы, старые/удалённые значения и т.п.). Mongoose валидирует ВЕСЬ
// документ команды при save(), поэтому одна битая запись в любом продукте
// блокирует сохранение чего угодно у этой команды. Чиним автоматически перед
// каждым save(), а не только у конкретного продукта, который редактируем.
const VALID_STATUSES = new Set<string>(SUB_STATUSES as unknown as string[])

function sanitizeTeamSubscriptions(team: any): boolean {
  let changed = false
  for (const [key, sub] of team.subscriptions.entries()) {
    if (!sub) continue
    const raw = sub.status
    const trimmed = typeof raw === 'string' ? raw.trim() : raw
    const fixedStatus = VALID_STATUSES.has(trimmed) ? trimmed : 'none'

    if (fixedStatus !== raw) {
      const plain = toPlainSub(sub)
      team.subscriptions.set(key, { ...plain, status: fixedStatus })
      changed = true
    }
  }
  return changed
}

/** save() с автопочинкой битых enum-значений в остальных продуктах команды */
async function saveTeam(team: any) {
  sanitizeTeamSubscriptions(team)
  return team.save()
}

// ==================== СПИСКИ / ПАГИНАЦИЯ ====================

export async function adminListUsers(page: number) {
  const skip = page * PAGE_SIZE
  const [users, total] = await Promise.all([
    UserModel.find().sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE),
    UserModel.countDocuments(),
  ])
  return { users, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function adminListTeams(page: number) {
  const skip = page * PAGE_SIZE
  const [teams, total] = await Promise.all([
    TeamModel.find().sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE),
    TeamModel.countDocuments(),
  ])
  return { teams, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function adminSearchUsers(query: string) {
  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const or: any[] = [
    { username: new RegExp(escapeRegex(trimmed), 'i') },
    { fio: new RegExp(escapeRegex(trimmed), 'i') },
  ]
  if (isNumeric) or.push({ telegramId: Number(trimmed) })
  return UserModel.find({ $or: or }).limit(20)
}

export async function adminSearchTeams(query: string) {
  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const or: any[] = [{ name: new RegExp(escapeRegex(trimmed), 'i') }]
  if (isNumeric) or.push({ ownerId: Number(trimmed) })
  return TeamModel.find({ $or: or }).limit(20)
}

// ==================== ЮЗЕР: базовые поля ====================

export async function adminGetUser(telegramId: number) {
  return UserModel.findOne({ telegramId })
}

export async function adminUpdateUserField(
  telegramId: number,
  field: 'fio' | 'city' | 'church' | 'username',
  value: string
) {
  return UserModel.updateOne({ telegramId }, { $set: { [field]: value } })
}

export async function adminGetTeamsForUser(telegramId: number) {
  return TeamModel.find({
    $or: [{ ownerId: telegramId }, { 'members.telegramId': telegramId }],
  })
}

/**
 * Полностью удалить профиль пользователя из доменной модели.
 * Его собственные команды удаляются тем же путём, что и из карточки команды;
 * из чужих команд пользователь только исключается.
 */
export async function adminDeleteUser(telegramId: number) {
  const user = await UserModel.findOne({ telegramId }).select({ _id: 1 })
  if (!user) return null

  const ownedTeams = await TeamModel.find({ ownerId: telegramId }).select({ _id: 1 })
  for (const team of ownedTeams) {
    await adminDeleteTeam(team._id.toString())
  }

  // После передачи владения приглашения и место в очереди принадлежат команде,
  // а не прежнему владельцу. Сохраняем эти данные и перепривязываем к текущему owner.
  const invitesToReassign = await TeamInviteModel.find({ createdBy: telegramId }).select({
    _id: 1,
    teamId: 1,
    code: 1,
  })
  const waitlistToReassign = await ProPresenterWaitlistModel.find({
    requestedBy: telegramId,
  }).select({ _id: 1, teamId: 1 })
  const orphanInviteCodes: string[] = []
  let invitesReassigned = 0
  let waitlistEntriesReassigned = 0

  for (const invite of invitesToReassign) {
    const team = await TeamModel.findById(invite.teamId).select({ ownerId: 1 })
    if (team) {
      await TeamInviteModel.updateOne({ _id: invite._id }, { $set: { createdBy: team.ownerId } })
      invitesReassigned += 1
    } else {
      orphanInviteCodes.push(invite.code)
      await TeamInviteModel.deleteOne({ _id: invite._id })
    }
  }

  for (const entry of waitlistToReassign) {
    const team = await TeamModel.findById(entry.teamId).select({ ownerId: 1 })
    if (team) {
      await ProPresenterWaitlistModel.updateOne(
        { _id: entry._id },
        { $set: { requestedBy: team.ownerId } }
      )
      waitlistEntriesReassigned += 1
    } else {
      await ProPresenterWaitlistModel.deleteOne({ _id: entry._id })
    }
  }

  if (orphanInviteCodes.length) {
    await UserModel.updateMany(
      { pendingInviteCode: { $in: orphanInviteCodes } },
      { $set: { pendingInviteCode: null } }
    )
  }

  const [memberships, inviteHistory, supportTickets] = await Promise.all([
    TeamModel.updateMany(
      { 'members.telegramId': telegramId },
      { $pull: { members: { telegramId } } }
    ),
    TeamInviteModel.updateMany({ usedBy: telegramId }, { $set: { usedBy: null } }),
    SupportTicketModel.deleteMany({ userId: telegramId }),
  ])

  // В старых документах User встречались ссылки на волонтёров, которых уже нет
  // в текущей схеме. Raw collection нужен, потому что strict Mongoose их отбрасывает.
  await Promise.all([
    UserModel.collection.updateMany(
      { telegramId: { $ne: telegramId } },
      {
        $pull: {
          volunteers: telegramId,
          'subscriptions.volunteers': { telegramId },
        },
      } as any
    ),
    UserModel.collection.updateMany(
      {
        telegramId: { $ne: telegramId },
        $or: [{ 'volunteer.ownerId': telegramId }, { ownerId: telegramId }],
      },
      { $unset: { volunteer: '', ownerId: '' }, $set: { isVolunteer: false } } as any
    ),
  ])

  const deletedUser = await UserModel.deleteOne({ _id: user._id })
  if (!deletedUser.deletedCount) return null

  return {
    ownedTeamsDeleted: ownedTeams.length,
    teamMembershipsRemoved: memberships.modifiedCount,
    invitesReassigned,
    inviteHistoryAnonymized: inviteHistory.modifiedCount,
    waitlistEntriesReassigned,
    supportTicketsDeleted: supportTickets.deletedCount,
  }
}

// ==================== КОМАНДА: базовые поля ====================

export async function adminGetTeam(teamId: string) {
  return TeamModel.findById(teamId)
}

export async function adminUpdateTeamName(teamId: string, name: string) {
  return TeamModel.updateOne({ _id: teamId }, { $set: { name: name.trim() } })
}

/** Полностью удалить команду и все служебные документы, которые на неё ссылаются. */
export async function adminDeleteTeam(teamId: string) {
  const team = await TeamModel.findById(teamId).select({ _id: 1 })
  if (!team) throw new Error('Команда не найдена')

  const invites = await TeamInviteModel.find({ teamId }).select({ code: 1, _id: 0 }).lean()
  const inviteCodes = invites.map((invite) => invite.code)

  const cleanup: Promise<unknown>[] = [
    CartModel.deleteMany({ teamId }).exec(),
    TeamInviteModel.deleteMany({ teamId }).exec(),
    ProPresenterWaitlistModel.deleteMany({ teamId }).exec(),
  ]

  if (inviteCodes.length) {
    cleanup.push(
      UserModel.updateMany(
        { pendingInviteCode: { $in: inviteCodes } },
        { $set: { pendingInviteCode: null } }
      ).exec()
    )
  }

  await Promise.all(cleanup)
  const result = await TeamModel.deleteOne({ _id: team._id })
  if (!result.deletedCount) throw new Error('Не удалось удалить команду')
  return true
}

// ---- владелец ----

export async function adminTransferOwnership(teamId: string, newOwnerTelegramId: number) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  if (!(await UserModel.exists({ telegramId: newOwnerTelegramId }))) {
    throw new Error('Пользователь не найден')
  }

  const isMember = team.members.some((m: any) => m.telegramId === newOwnerTelegramId)
  if (!isMember) {
    team.members.push({ telegramId: newOwnerTelegramId, role: 'owner', status: 'active' } as any)
  }

  team.members = team.members.map((m: any) => {
    const obj = m.toObject ? m.toObject() : m
    if (obj.telegramId === team.ownerId) return { ...obj, role: 'member' }
    if (obj.telegramId === newOwnerTelegramId) return { ...obj, role: 'owner' }
    return obj
  }) as any

  team.ownerId = newOwnerTelegramId
  await saveTeam(team)
  return team
}

// ---- участники ----

export async function adminAddTeamMember(teamId: string, telegramId: number) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  if (!(await UserModel.exists({ telegramId }))) throw new Error('Пользователь не найден')

  const already = team.members.some((m: any) => m.telegramId === telegramId)
  if (already) return team

  team.members.push({ telegramId, role: 'member', status: 'active' } as any)
  await saveTeam(team)
  return team
}

export async function adminRemoveTeamMember(teamId: string, telegramId: number) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')

  if (team.ownerId === telegramId) {
    throw new Error('Нельзя удалить владельца — сначала передай владение другому участнику')
  }

  team.members = team.members.filter((m: any) => m.telegramId !== telegramId) as any
  await saveTeam(team)
  return team
}

// ---- подписки команды: subscriptions — Map<productId, {status, expiresAt, meta}> ----

export async function adminSetTeamSubStatus(teamId: string, product: string, status: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  const current = toPlainSub(team.subscriptions.get(product)) || { meta: {} }
  team.subscriptions.set(product, { ...current, status } as any)
  await saveTeam(team)
  return team
}

export async function adminSetTeamSubExpiry(
  teamId: string,
  product: string,
  expiresAt: Date | null
) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  const current = toPlainSub(team.subscriptions.get(product)) || { status: 'none', meta: {} }
  team.subscriptions.set(product, { ...current, expiresAt } as any)
  await saveTeam(team)
  return team
}

export async function adminExtendTeamSub(teamId: string, product: string, years = 1) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')

  const current = toPlainSub(team.subscriptions.get(product))
  const now = new Date()
  const wasActive =
    !!current && current.status === 'active' && current.expiresAt && current.expiresAt > now

  const base = wasActive ? current.expiresAt : now
  const expiresAt = new Date(base)
  expiresAt.setFullYear(expiresAt.getFullYear() + years)

  team.subscriptions.set(product, {
    status: 'active',
    expiresAt,
    meta: current?.meta || {},
  } as any)

  await saveTeam(team)
  return expiresAt
}

export async function adminResetTeamSub(teamId: string, product: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  team.subscriptions.set(product, { status: 'none', expiresAt: null, meta: {} } as any)
  await saveTeam(team)
  return team
}

// ==================== ПОТОКИ PROPRESENTER (справочник — всё из БД) ====================

export async function adminGetAllStreams() {
  return ProPresenterStreamModel.find().sort({ flowNumber: 1 })
}

export async function adminGetStream(flowNumber: number) {
  return ProPresenterStreamModel.findOne({ flowNumber })
}

export async function adminUpdateStream(
  flowNumber: number,
  updates: Partial<{
    email: string
    password: string
    chatLink: string
    capacity: number
    status: 'active' | 'closed'
  }>
) {
  const stream = await ProPresenterStreamModel.findOneAndUpdate(
    { flowNumber },
    { $set: updates },
    { new: true }
  )
  if (!stream) return null

  const teamUpdates: Record<string, string> = {}
  if (updates.email !== undefined) {
    teamUpdates['subscriptions.propresenter.meta.email'] = updates.email
  }
  if (updates.password !== undefined) {
    teamUpdates['subscriptions.propresenter.meta.password'] = updates.password
  }
  if (updates.chatLink !== undefined) {
    teamUpdates['subscriptions.propresenter.meta.chatLink'] = updates.chatLink
  }

  if (Object.keys(teamUpdates).length) {
    await TeamModel.updateMany(
      { 'subscriptions.propresenter.meta.flowNumber': flowNumber },
      { $set: teamUpdates }
    )
  }

  return stream
}

export async function adminSetStreamExpiry(flowNumber: number, expiresAt: Date | null) {
  const stream = await ProPresenterStreamModel.findOneAndUpdate(
    { flowNumber },
    { $set: { expiresAt } },
    { new: true }
  )
  await TeamModel.updateMany(
    {
      'subscriptions.propresenter.meta.flowNumber': flowNumber,
      'subscriptions.propresenter.status': { $in: ['active', 'expired'] },
    },
    {
      $set: {
        'subscriptions.propresenter.expiresAt': expiresAt,
        // Если администратор поставил новую будущую дату, доступ потока восстанавливается.
        ...(expiresAt && expiresAt > new Date()
          ? { 'subscriptions.propresenter.status': 'active' }
          : {}),
      },
    }
  )
  return stream
}

export async function adminCreateStream(data: {
  email: string
  password: string
  chatLink?: string
  capacity?: number
}) {
  const last = await ProPresenterStreamModel.findOne().sort({ flowNumber: -1 })
  const flowNumber = (last?.flowNumber || 0) + 1
  return ProPresenterStreamModel.create({
    flowNumber,
    email: data.email,
    password: data.password,
    chatLink: data.chatLink || '',
    capacity: data.capacity || 30,
    status: 'active',
  })
}

export async function adminCreateStreamFromWaitlist(data: {
  flowNumber: number
  email: string
  password: string
  chatLink?: string
  expiresAt: Date
}) {
  const existing = await ProPresenterStreamModel.findOne({ flowNumber: data.flowNumber })
  if (existing) throw new Error(`Поток #${data.flowNumber} уже существует`)

  const entries = await ProPresenterWaitlistModel.find({
    status: 'pending',
    assignedFlowNumber: data.flowNumber,
  }).sort({ createdAt: 1 })
  if (!entries.length) throw new Error('В этой партии нет заявок')

  const stream = await ProPresenterStreamModel.create({
    flowNumber: data.flowNumber,
    email: data.email,
    password: data.password,
    chatLink: data.chatLink || '',
    capacity: 20,
    status: 'active',
    expiresAt: data.expiresAt,
  })

  for (const entry of entries) {
    const team = await TeamModel.findById(entry.teamId)
    if (!team) continue
    team.subscriptions.set('propresenter', {
      status: 'active',
      expiresAt: data.expiresAt,
      meta: {
        flowNumber: data.flowNumber,
        email: data.email,
        password: data.password,
        chatLink: data.chatLink || '',
      },
    } as any)
    await saveTeam(team)
  }

  await ProPresenterWaitlistModel.updateMany(
    { status: 'pending', assignedFlowNumber: data.flowNumber },
    { $set: { status: 'assigned' } }
  )

  return { stream, entries }
}

export async function adminDeleteStream(flowNumber: number) {
  const res = await ProPresenterStreamModel.deleteOne({ flowNumber })
  if (!res.deletedCount) throw new Error('Поток не найден')
  return true
}

// ---- команды внутри потока (доступ к ProPresenter выдаётся команде целиком) ----

/** Команды, у которых прямо сейчас активна подписка propresenter именно на этот поток */
export async function adminGetTeamsInStream(flowNumber: number) {
  return TeamModel.find({
    'subscriptions.propresenter.status': 'active',
    'subscriptions.propresenter.meta.flowNumber': flowNumber,
  })
}

/** Уникальные зарегистрированные пользователи команд выбранного потока. */
export async function adminGetUserIdsInStream(flowNumber: number): Promise<number[]> {
  const teams = await adminGetTeamsInStream(flowNumber)
  const memberIds = new Set<number>()
  for (const team of teams) {
    memberIds.add(team.ownerId)
    for (const member of team.members) {
      if (member.status === 'active') memberIds.add(member.telegramId)
    }
  }
  if (!memberIds.size) return []

  const users = await UserModel.find({ telegramId: { $in: [...memberIds] }, reg: 'done' })
    .select({ telegramId: 1, _id: 0 })
    .lean()
  return users.map((user) => user.telegramId)
}

/** Сколько команд уже сидит в потоке (источник правды — сами команды, а не отдельный счётчик) */
export async function adminGetStreamOccupancy(flowNumber: number): Promise<number> {
  return TeamModel.countDocuments({
    'subscriptions.propresenter.status': 'active',
    'subscriptions.propresenter.meta.flowNumber': flowNumber,
  })
}

/** Посадить команду в поток: копирует email/password/chatLink/дату из справочника потоков */
export async function adminAddTeamToStream(teamId: string, flowNumber: number) {
  const stream = await ProPresenterStreamModel.findOne({ flowNumber })
  if (!stream) throw new Error('Поток не найден')

  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')

  const already = toPlainSub(team.subscriptions.get('propresenter'))
  const alreadyInThisStream =
    already?.status === 'active' && Number(already?.meta?.flowNumber) === flowNumber

  if (!alreadyInThisStream && stream.status !== 'active') {
    throw new Error('Поток закрыт — сначала открой его ("🟢 Открыть поток")')
  }

  if (!alreadyInThisStream) {
    const occupancy = await adminGetStreamOccupancy(flowNumber)
    if (occupancy >= (stream.capacity || 30)) {
      throw new Error(`В потоке уже максимум команд (${stream.capacity})`)
    }
  }

  team.subscriptions.set('propresenter', {
    status: 'active',
    expiresAt: stream.expiresAt || null,
    meta: {
      flowNumber: stream.flowNumber,
      email: stream.email,
      password: stream.password,
      chatLink: stream.chatLink,
    },
  } as any)

  await saveTeam(team)
  await ProPresenterWaitlistModel.updateMany(
    { teamId, status: 'pending' },
    { $set: { status: 'assigned', assignedFlowNumber: flowNumber } }
  )
  return team
}

/** Убрать команду из потока (сбрасывает её подписку propresenter в "нет подписки") */
export async function adminRemoveTeamFromStream(teamId: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Команда не найдена')
  team.subscriptions.set('propresenter', { status: 'none', expiresAt: null, meta: {} } as any)
  await saveTeam(team)
  return team
}

// ==================== ВСПОМОГАТЕЛЬНОЕ ====================

/** "31.12.2026" -> Date | null (кидает Error если формат не распознан) */
export function parseDateInput(text: string): Date | null {
  const t = text.trim().toLowerCase()
  if (t === '-' || t === 'нет' || t === 'none') return null

  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) {
    throw new Error('Формат даты: ДД.ММ.ГГГГ (например 31.12.2026), либо "-" чтобы очистить')
  }
  const [, dd, mm, yyyy] = m
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0)
  if (isNaN(date.getTime())) {
    throw new Error('Некорректная дата')
  }
  return date
}
