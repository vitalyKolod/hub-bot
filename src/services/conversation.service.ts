import { InlineKeyboard, type Context } from 'grammy'
import { ConversationModel, CONVERSATION_TYPES } from '../models/Conversation.js'
import { ConversationMessageModel } from '../models/ConversationMessage.js'
import { PaymentModel } from '../models/Payment.js'
import { UserModel } from '../models/User.js'
import { SupportTicketModel } from '../models/SupportTicket.js'
import { hasAdminPermission, type AdminPermission } from './adminAccess.service.js'
import { deliverAdminMessageToUser, deliverUserMessageToAdmin } from './support.service.js'

export type ConversationType = (typeof CONVERSATION_TYPES)[number]

type EnabledConversationType = Extract<ConversationType, 'support' | 'payment'>

function isEnabledType(type: string): type is EnabledConversationType {
  return type === 'support' || type === 'payment'
}

const typeCode: Record<EnabledConversationType, string> = { support: 'h', payment: 'p' }
const codeType = Object.fromEntries(Object.entries(typeCode).map(([type, code]) => [code, type])) as Record<string, ConversationType>

const permissionByType: Record<EnabledConversationType, AdminPermission> = {
  support: 'support.reply',
  payment: 'payments.manage',
}

export function conversationCallback(action: 'open' | 'close' | 'reopen', typeOrId: string, contextId?: string) {
  if (contextId && !isEnabledType(typeOrId)) throw new Error('Общение для этого раздела отключено')
  return contextId
    ? `cv:o:${typeCode[typeOrId as EnabledConversationType]}:${encodeURIComponent(contextId)}`
    : `cv:${action === 'close' ? 'c' : 'r'}:${typeOrId}`
}

export function parseConversationCallback(data: string) {
  const open = data.match(/^cv:o:([^:]+):(.+)$/)
  if (open && codeType[open[1]]) return { action: 'open' as const, value: codeType[open[1]], contextId: decodeURIComponent(open[2]) }
  const state = data.match(/^cv:(c|r):([^:]+)$/)
  if (!state) return null
  return { action: state[1] === 'c' ? 'close' as const : 'reopen' as const, value: state[2], contextId: undefined }
}

export function appendConversationContactButtons(
  keyboard: InlineKeyboard,
  type: EnabledConversationType,
  contextId: string,
  userId: number
) {
  return keyboard
    .text('💬 Написать пользователю', conversationCallback('open', type, contextId)).row()
    .url('👤 Открыть Telegram-профиль', `tg://user?id=${userId}`)
}

async function resolveContext(type: ConversationType, contextId: string) {
  if (type === 'support') {
    const ticket = await SupportTicketModel.findById(contextId)
    return ticket ? { userId: ticket.userId, label: 'Поддержка' } : null
  }
  if (type === 'payment') {
    const payment = await PaymentModel.findById(contextId)
    return payment ? { userId: payment.userId, label: `Оплата ${payment.id}` } : null
  }
  return null
}

async function requirePermission(adminId: number, type: ConversationType) {
  return isEnabledType(type) && hasAdminPermission(adminId, permissionByType[type])
}

async function activateForUser(conversation: any) {
  await ConversationModel.updateMany(
    { userId: conversation.userId, _id: { $ne: conversation._id }, userActive: true },
    { $set: { userActive: false } }
  )
  conversation.userActive = true
  await conversation.save()
}

function controlKeyboard(conversation: any) {
  return new InlineKeyboard().text(
    conversation.status === 'open' ? '✅ Завершить обращение' : '🔓 Возобновить обращение',
    conversationCallback(conversation.status === 'open' ? 'close' : 'reopen', conversation.id)
  )
}

async function controlText(conversation: any, contextLabel: string, userLabel: string) {
  return conversation.status === 'open'
    ? `💬 РЕЖИМ ОБЩЕНИЯ ВКЛЮЧЁН\n\nПользователь: ${userLabel}\nКонтекст: ${contextLabel}\n\nОтправьте сообщение —\nоно будет доставлено пользователю от имени HUB.`
    : `💬 ОБРАЩЕНИЕ ЗАВЕРШЕНО\n\nПользователь: ${userLabel}\nКонтекст: ${contextLabel}`
}

async function updateControlMessage(ctx: any, conversation: any, context: any) {
  const profile = await UserModel.findOne({ telegramId: conversation.userId })
  const userLabel = profile?.fio || (profile?.username ? `@${profile.username}` : String(conversation.userId))
  const text = await controlText(conversation, context.label, userLabel)
  if (conversation.controlMessageId) {
    await ctx.api.editMessageText(conversation.adminChatId, conversation.controlMessageId, text, {
      reply_markup: controlKeyboard(conversation),
    })
    return
  }
  const sent = await ctx.api.sendMessage(conversation.adminChatId, text, {
    message_thread_id: conversation.adminThreadId || undefined,
    reply_markup: controlKeyboard(conversation),
  })
  conversation.controlMessageId = sent.message_id
  await conversation.save()
}

export async function openConversation(ctx: any, type: ConversationType, contextId: string) {
  if (!isEnabledType(type)) throw new Error('Общение для этого раздела отключено')
  const adminId = ctx.from?.id
  if (!adminId || !(await requirePermission(adminId, type))) throw new Error('Недостаточно прав')
  const context = await resolveContext(type, contextId)
  if (!context) throw new Error('Контекст обращения не найден')
  const source = ctx.callbackQuery?.message
  if (!source) throw new Error('Admin message not found')
  const now = new Date()
  const conversation = await ConversationModel.findOneAndUpdate(
    { type, contextId },
    {
      $set: {
        userId: context.userId,
        status: 'open',
        adminChatId: source.chat.id,
        adminThreadId: source.message_thread_id || null,
        adminMessageId: source.message_id,
        lastActivityAt: now,
        closedAt: null,
        closedBy: null,
        closeReason: null,
      },
      $setOnInsert: { openedBy: 'admin', openedByAdminId: adminId },
    },
    { upsert: true, new: true, runValidators: true }
  )
  await activateForUser(conversation)
  ctx.session.activeConversationId = conversation.id
  await updateControlMessage(ctx, conversation, context)
  return conversation
}

export async function closeConversation(ctx: any, conversationId: string) {
  const conversation = await ConversationModel.findById(conversationId)
  if (!conversation) throw new Error('Обращение не найдено')
  if (!(await requirePermission(ctx.from.id, conversation.type as ConversationType))) throw new Error('Недостаточно прав')
  if (conversation.status === 'closed') return { conversation, applied: false }
  conversation.status = 'closed'
  conversation.userActive = false
  conversation.closedAt = new Date()
  conversation.closedBy = ctx.from.id
  conversation.closeReason = 'manual'
  conversation.lastActivityAt = new Date()
  await conversation.save()
  if (ctx.session.activeConversationId === conversation.id) ctx.session.activeConversationId = undefined
  const context = await resolveContext(conversation.type as ConversationType, conversation.contextId)
  await updateControlMessage(ctx, conversation, context || { label: conversation.type })
  return { conversation, applied: true }
}

export async function reopenConversation(ctx: any, conversationId: string) {
  const conversation = await ConversationModel.findById(conversationId)
  if (!conversation) throw new Error('Обращение не найдено')
  if (!(await requirePermission(ctx.from.id, conversation.type as ConversationType))) throw new Error('Недостаточно прав')
  if (conversation.status === 'open') return { conversation, applied: false }
  const context = await resolveContext(conversation.type as ConversationType, conversation.contextId)
  if (!context) throw new Error('Контекст обращения больше не существует')
  conversation.status = 'open'
  conversation.reopenedAt = new Date()
  conversation.reopenedBy = ctx.from.id
  conversation.lastActivityAt = new Date()
  await activateForUser(conversation)
  ctx.session.activeConversationId = conversation.id
  await updateControlMessage(ctx, conversation, context)
  return { conversation, applied: true }
}

export async function resolveActiveConversation(userId: number) {
  const conversations = await ConversationModel.find({ userId, type: 'payment', userActive: true, status: 'open' }).sort({ updatedAt: -1 }).limit(2)
  return conversations.length === 1 ? conversations[0] : null
}

async function recordDelivery(conversation: any, direction: 'admin_to_user' | 'user_to_admin', senderId: number, sourceId: number, destinationId: number) {
  await ConversationMessageModel.findOneAndUpdate(
    { conversationId: conversation._id, direction, telegramSourceMessageId: sourceId },
    { $setOnInsert: { senderId, telegramDestinationMessageId: destinationId } },
    { upsert: true, new: true }
  )
  conversation.lastActivityAt = new Date()
  await conversation.save()
}

export async function relayActiveConversationMessage(ctx: any) {
  if (!ctx.message || !ctx.from || ctx.from.is_bot) return false
  const adminConversationId = ctx.session.activeConversationId
  if (adminConversationId) {
    const conversation = await ConversationModel.findById(adminConversationId)
    if (
      conversation && isEnabledType(conversation.type) && conversation.status === 'open' &&
      conversation.adminChatId === ctx.chat.id &&
      (conversation.adminThreadId || undefined) === ctx.message.message_thread_id
    ) {
      if (!(await requirePermission(ctx.from.id, conversation.type as ConversationType))) return true
      const currentContext = await resolveContext(conversation.type as ConversationType, conversation.contextId)
      if (!currentContext) {
        await ctx.react('👎').catch(() => {})
        await ctx.reply('⚠️ Контекст обращения больше не существует.')
        return true
      }
      conversation.userId = currentContext.userId
      const delivered = await deliverAdminMessageToUser(ctx, currentContext.userId)
      if (delivered) await recordDelivery(conversation, 'admin_to_user', ctx.from.id, ctx.message.message_id, delivered.message_id)
      return true
    }
  }
  if (ctx.chat.type !== 'private') return false
  const conversation = await resolveActiveConversation(ctx.from.id)
  if (!conversation) return false
  const currentContext = await resolveContext(conversation.type as ConversationType, conversation.contextId)
  if (!currentContext || currentContext.userId !== ctx.from.id) return false
  const delivered = await deliverUserMessageToAdmin(ctx, conversation.adminChatId, conversation.adminThreadId || undefined)
  if (delivered) await recordDelivery(conversation, 'user_to_admin', ctx.from.id, ctx.message.message_id, delivered.message_id)
  return true
}
