import type { Api } from 'grammy'
import { PRODUCTS } from '../config/products.js'
import { GroupAccessRevocationModel } from '../models/GroupAccessRevocation.js'
import { TeamModel } from '../models/Team.js'
import { recordOperationalEvent } from './auditLog.service.js'

type JoinApi = Pick<Api, 'createChatInviteLink' | 'approveChatJoinRequest' |
  'declineChatJoinRequest' | 'banChatMember' | 'unbanChatMember'>

export function productsForChat(chatId: number): string[] {
  return Object.values(PRODUCTS)
    .filter((product) => product.groupId === chatId && Number.isSafeInteger(chatId) && chatId < 0)
    .map((product) => product.id)
}

export function hasEntitlementInTeams(
  teams: Array<{ ownerId: number; members: Array<{ telegramId: number; status: string }>;
    subscriptions: Map<string, { status: string; expiresAt?: Date | null }> }>,
  productIds: string[], telegramId: number, now = new Date()
): boolean {
  return teams.some((team) => {
    const belongs = team.ownerId === telegramId || team.members.some(
      (member) => member.telegramId === telegramId && member.status === 'active'
    )
    if (!belongs) return false
    return productIds.some((productId) => {
      const subscription = team.subscriptions.get(productId)
      // A future end date protects legacy records accidentally marked expired.
      return !!subscription?.expiresAt && ['active', 'expired'].includes(subscription.status) &&
        new Date(subscription.expiresAt) > now
    })
  })
}

export async function hasProductChatAccess(chatId: number, telegramId: number): Promise<boolean | null> {
  const productIds = productsForChat(chatId)
  if (!productIds.length) return null
  const teams = await TeamModel.find({
    $or: [{ ownerId: telegramId }, { members: { $elemMatch: { telegramId, status: 'active' } } }],
  })
  return hasEntitlementInTeams(teams, productIds, telegramId)
}

/** Every issued link requests approval; possession of the URL grants no access. */
export async function createProtectedChatInvite(api: JoinApi, productId: string, telegramId: number) {
  const chatId = Number(PRODUCTS[productId]?.groupId)
  if (!chatId || !(await hasProductChatAccess(chatId, telegramId))) return null
  const blockedTask = await GroupAccessRevocationModel.findOne({ chatId, telegramId, status: 'blocked' })
  if (blockedTask) {
    await api.unbanChatMember(chatId, telegramId, { only_if_banned: true })
    blockedTask.status = 'restored'
    await blockedTask.save()
  }
  return api.createChatInviteLink(chatId, {
    name: 'HUB: проверка доступа',
    expire_date: Math.floor(Date.now() / 1000) + 60 * 60,
    creates_join_request: true,
  })
}

export async function handleProductJoinRequest(
  api: JoinApi, chatId: number, telegramId: number
): Promise<boolean> {
  const allowed = await hasProductChatAccess(chatId, telegramId)
  if (allowed === null) return false
  if (allowed) {
    await api.approveChatJoinRequest(chatId, telegramId)
  } else {
    await api.declineChatJoinRequest(chatId, telegramId)
    await recordOperationalEvent({
      type: 'access.join_denied', actorType: 'system', targetUserId: telegramId,
      metadata: { groupId: chatId, result: 'заявка отклонена', accessReason: 'нет действующей подписки команды' },
    })
  }
  return true
}

/** Legacy and copied direct links may still bypass join requests. Remove those entrants. */
export async function handleProductMemberJoined(
  api: JoinApi, chatId: number, telegramId: number
): Promise<boolean> {
  const allowed = await hasProductChatAccess(chatId, telegramId)
  if (allowed === null || allowed) return allowed !== null
  const productId = productsForChat(chatId)[0]
  const task = await GroupAccessRevocationModel.findOneAndUpdate(
    { chatId, telegramId },
    { $setOnInsert: { chatId, telegramId, productId, teamId: 'unassigned', status: 'pending' } },
    { upsert: true, new: true }
  )
  await api.banChatMember(chatId, telegramId)
  task.status = 'blocked'
  task.completedAt = new Date()
  await task.save()
  await recordOperationalEvent({
    type: 'access.join_removed', actorType: 'system', targetUserId: telegramId,
    metadata: { groupId: chatId, productId, result: 'вступление отменено, пользователь заблокирован',
      accessReason: 'нет действующей подписки команды' },
  })
  return true
}
