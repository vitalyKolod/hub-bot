import { getUserTeams, getTeamById } from '../services/team.service.js'
import { UserModel } from '../models/User.js'
import { isTeamMember } from './auth/teamAccess.js'
import { ApiError, found, objectId, pagination } from './http.js'
import type { ApiContext } from './contract.js'
import { serializeTeam, serializeUser } from './serializers.js'

export async function memberTeam(context: ApiContext, ownerOnly = false) {
  const team = found(await getTeamById(objectId(context.params.teamId)))
  if (!isTeamMember(team, context.session.user.id)) throw new ApiError(404, 'NOT_FOUND', 'Team not found')
  if (ownerOnly && team.ownerId !== context.session.user.id) throw new ApiError(403, 'OWNER_REQUIRED', 'Only the team owner can perform this action')
  return team
}
export async function teamData(teams: any[], viewerId: number, admin = false, subscriptions = true) {
  const ids = [...new Set(teams.flatMap((team) => [team.ownerId, ...team.members.map((member: any) => member.telegramId)]))]
  const users = await UserModel.find({ telegramId: { $in: ids } }).select('telegramId username fio city church').lean()
  const profiles = new Map<number, any>(users.map((user) => [user.telegramId, user]))
  return teams.map((team) => {
    const data = serializeTeam(team, viewerId, profiles)
    if (!subscriptions) data.subscriptions = []
    return admin ? { ...data, ownerId: team.ownerId, members: team.members.map((member: any, index: number) => ({ ...data.members[index], telegramId: member.telegramId })) } : data
  })
}
export async function visibleTeams(userId: number) { return (await getUserTeams(userId)).filter(team => team.ownerId === userId || isTeamMember(team, userId)) }
export async function myTeams(userId: number) { return teamData(await visibleTeams(userId), userId) }
export function adminUser(user: any) { return { ...serializeUser(user), telegramId: user.telegramId, createdAt: user.createdAt, updatedAt: user.updatedAt } }
export async function list(model: any, query: URLSearchParams, filter: any = {}, serializer: (item: any) => any = plain, sort: any = { updatedAt: -1, _id: -1 }) {
  const { page, limit, skip } = pagination(query)
  const status = query.get('status')
  const where = { ...filter, ...(status ? { status } : {}) }
  const [items, total] = await Promise.all([model.find(where).sort(sort).skip(skip).limit(limit), model.countDocuments(where)])
  return { data: items.map(serializer), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
export function plain(item: any): any {
  const data = item.toObject ? item.toObject() : { ...item }
  const { _id, __v, ...rest } = data
  return { id: String(_id), ...rest }
}
export async function domain<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error: any) {
    if (error instanceof ApiError) throw error
    if (error?.name === 'AdminPermissionError') throw new ApiError(403, 'PERMISSION_REQUIRED', 'Administrator permission required')
    // Database and Telegram failures stay server errors; domain validation is a conflict.
    if (error?.constructor === Error || /ValidationError$/.test(error?.name || '')) throw new ApiError(409, 'DOMAIN_CONFLICT', error.message)
    throw error
  }
}
