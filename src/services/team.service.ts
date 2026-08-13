import { TeamModel } from '../models/Team.js'

/**
 * Создать команду
 */
export async function createTeam(ownerId: number, name: string) {
  const cleanName = name.trim()

  return TeamModel.create({
    name: cleanName,

    ownerId,

    members: [
      {
        telegramId: ownerId,
        role: 'owner',
        status: 'active',
      },
    ],
  })
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
