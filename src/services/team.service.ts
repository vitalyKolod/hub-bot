import { TeamModel } from '../models/Team.js'
import { UserModel } from '../models/User.js'

const RENEWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export const TEAM_NAME_MAX_LENGTH = 50

export class TeamNameValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamNameValidationError'
  }
}

export class TeamOwnerNotFoundError extends Error {
  constructor() {
    super('Пользователь не найден')
    this.name = 'TeamOwnerNotFoundError'
  }
}

export function normalizeTeamName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateTeamName(value: unknown, minLength = 1): string {
  const name = normalizeTeamName(value)

  if (name.length < minLength) {
    throw new TeamNameValidationError(
      minLength > 1
        ? `Название команды должно содержать минимум ${minLength} символа.`
        : 'Название команды не может быть пустым.'
    )
  }

  if (name.length > TEAM_NAME_MAX_LENGTH) {
    throw new TeamNameValidationError(
      `Название команды не должно быть длиннее ${TEAM_NAME_MAX_LENGTH} символов.`
    )
  }

  return name
}

function fitGeneratedTeamName(value: string): string {
  const name = normalizeTeamName(value)
  return name.length > TEAM_NAME_MAX_LENGTH
    ? name.slice(0, TEAM_NAME_MAX_LENGTH).trimEnd()
    : name
}

export function generateTeamNameForUser(user: {
  church?: unknown
  city?: unknown
  fio?: unknown
}): string {
  const church = normalizeTeamName(user.church)
  const city = normalizeTeamName(user.city)
  const fio = normalizeTeamName(user.fio)

  if (church && city) return fitGeneratedTeamName(`${church} · ${city}`)
  if (church) return fitGeneratedTeamName(church)
  if (city) return fitGeneratedTeamName(`Команда · ${city}`)
  if (fio) return fitGeneratedTeamName(`Команда ${fio}`)
  return 'Новая команда'
}

export type CreateTeamForUserInput = {
  userId: number
  name: unknown
  createdByAdminId?: number
}

/** В команде есть хотя бы одна действующая подписка. */
export function hasActiveTeamSubscription(team: {
  subscriptions?: Map<string, { status?: string; expiresAt?: Date | null }>
}) {
  if (!team.subscriptions) return false

  const now = Date.now()
  for (const subscription of team.subscriptions.values()) {
    const expiresAt = subscription?.expiresAt
    if (
      subscription?.status === 'active' &&
      expiresAt &&
      new Date(expiresAt).getTime() > now
    ) {
      return true
    }
  }

  return false
}

/** Активную подписку нельзя купить повторно до начала окна продления. */
export async function isTeamProductPurchaseLocked(teamId: string, productId: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) return false
  const subscription = team.subscriptions.get(productId)
  if (subscription?.status !== 'active' || !subscription.expiresAt) return false
  return subscription.expiresAt.getTime() - Date.now() > RENEWAL_WINDOW_MS
}

/**
 * Создать обычную команду для пользователя. Единственная точка, которая
 * формирует owner/member-инвариант как для самостоятельного, так и для
 * административного сценария.
 */
export async function createTeamForUser({
  userId,
  name,
  createdByAdminId,
}: CreateTeamForUserInput) {
  const cleanName = validateTeamName(name)

  if (!Number.isSafeInteger(userId) || !(await UserModel.exists({ telegramId: userId }))) {
    throw new TeamOwnerNotFoundError()
  }

  const team = await TeamModel.create({
    name: cleanName,
    ownerId: userId,
    members: [
      {
        telegramId: userId,
        role: 'owner',
        status: 'active',
      },
    ],
  })

  if (createdByAdminId !== undefined) {
    console.info('admin_created_team', {
      adminTelegramId: createdByAdminId,
      targetUserId: userId,
      teamId: team._id.toString(),
      teamName: team.name,
      createdAt: (team as any).createdAt || new Date(),
    })
  }

  return team
}

/** Обратная совместимость для обычного пользовательского flow. */
export async function createTeam(ownerId: number, name: string) {
  return createTeamForUser({ userId: ownerId, name })
}

/**
 * Все команды пользователя
 */
export async function getUserTeams(userId: number) {
  return TeamModel.find({
    $or: [
      {
        ownerId: userId,
      },
      {
        'members.telegramId': userId,
      },
    ],
  })
}

/**
 * Получить команду по id
 */
export async function getTeam(teamId: string) {
  return TeamModel.findById(teamId)
}

/**
 * Проверка владельца
 */
export async function isOwner(teamId: string, userId: number) {
  const team = await TeamModel.findById(teamId)

  if (!team) return false

  return team.ownerId === userId
}

/**
 * Команда пользователя
 * (если она одна)
 */
export async function getFirstUserTeam(userId: number) {
  return TeamModel.findOne({
    $or: [
      {
        ownerId: userId,
      },
      {
        'members.telegramId': userId,
      },
    ],
  })
}

export async function getTeamByOwner(ownerId: number) {
  return TeamModel.findOne({ ownerId })
}

export async function getTeamById(teamId: string) {
  return TeamModel.findById(teamId)
}

/** Номер потока команды с активным доступом ProPresenter. */
export async function getActiveProPresenterFlowNumber(teamId: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) return null

  const subscription = team.subscriptions.get('propresenter')
  const flowNumber = Number((subscription?.meta as { flowNumber?: number } | undefined)?.flowNumber)

  return subscription?.status === 'active' && Number.isFinite(flowNumber) && flowNumber > 0
    ? flowNumber
    : null
}

export async function activateTeamSubscription(teamId: string, productId: string, extendYears = 1) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Team not found')

  const current = team.subscriptions.get(productId)
  const now = new Date()
  const wasActive =
    !!current && current.status === 'active' && current.expiresAt && current.expiresAt > now

  const base = wasActive ? current!.expiresAt! : now
  const expiresAt = new Date(base)
  expiresAt.setFullYear(expiresAt.getFullYear() + extendYears)

  team.subscriptions.set(productId, {
    status: 'active',
    expiresAt,
    meta: current?.meta || {},
  } as any)

  await team.save()
  return { team, isExtension: wasActive }
}

export async function rejectTeamSubscription(teamId: string, productId: string) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Team not found')
  team.subscriptions.set(productId, { status: 'rejected', meta: {} } as any)
  await team.save()
  return team
}

export async function addMemberToTeam(teamId: string, telegramId: number) {
  const team = await TeamModel.findById(teamId)
  if (!team) throw new Error('Team not found')

  const alreadyMember = team.members.some((m: any) => m.telegramId === telegramId)
  if (alreadyMember) {
    return team
  }

  team.members.push({
    telegramId,
    role: 'member',
    status: 'active',
  } as any)

  await team.save()
  return team
}
