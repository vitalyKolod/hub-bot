import { getProduct } from '../config/products.js'

export function serializeUser(user: any) {
  return {
    username: user.username || null,
    fio: user.fio || null,
    city: user.city || null,
    church: user.church || null,
    registrationStatus: user.reg,
  }
}

export function serializeSubscription(productId: string, subscription: any) {
  const expiresAt = subscription?.expiresAt ? new Date(subscription.expiresAt) : null
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
    : null
  return {
    productId,
    productName: getProduct(productId)?.name || productId,
    status: subscription?.status || 'none',
    expiresAt: expiresAt?.toISOString() || null,
    daysLeft,
    // Credentials and chat links are deliberately excluded from collection responses.
    flowNumber: Number(subscription?.meta?.flowNumber) || null,
  }
}

export function serializeTeam(team: any, viewerTelegramId: number, profiles: Map<number, any> = new Map()) {
  const subscriptions = [...(team.subscriptions?.entries?.() || [])].map(
    ([productId, subscription]) => serializeSubscription(productId, subscription)
  )
  return {
    id: team._id.toString(),
    name: team.name,
    church: profiles.get(team.ownerId)?.church || null,
    city: profiles.get(team.ownerId)?.city || null,
    viewerRole: team.ownerId === viewerTelegramId ? 'owner' : 'member',
    membersCount: team.members.length,
    members: team.members.map((member: any) => ({
      name: profiles.get(member.telegramId)?.fio || profiles.get(member.telegramId)?.username || 'Участник HUB',
      username: profiles.get(member.telegramId)?.username || null,
      role: member.role,
      status: member.status,
    })),
    subscriptions,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  }
}

export function serializePayment(payment: any) {
  return {
    id: payment._id.toString(), userId: payment.userId, teamId: payment.teamId,
    productId: payment.productId, productName: getProduct(payment.productId)?.name || payment.productId,
    amount: payment.amount, currency: payment.currency, paymentMethod: payment.paymentMethod,
    operation: payment.operation, status: payment.status,
    receipt: payment.receipt ? { type: payment.receipt.type, fileName: payment.receipt.fileName || null, mimeType: payment.receipt.mimeType || null } : null,
    createdAt: payment.createdAt, updatedAt: payment.updatedAt,
    acceptedAt: payment.acceptedAt || null, rejectedAt: payment.rejectedAt || null, adminId: payment.adminId || null,
  }
}

export function serializeSupportTicket(ticket: any) {
  return { id: ticket._id.toString(), status: ticket.status, closedBy: ticket.closedBy || null, closedAt: ticket.closedAt || null, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt }
}

export function serializeSupportMessage(message: any) {
  return { id: message._id.toString(), conversationId: message.ticketId.toString(), senderType: message.senderType, senderId: message.senderId || null, text: message.text || null, attachments: message.attachments.map((a: any) => ({ type: a.type, fileName: a.fileName || null, mimeType: a.mimeType || null })), createdAt: message.createdAt }
}
