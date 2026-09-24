import { isDeepStrictEqual } from 'node:util'
import { InlineKeyboard, type Api, type Context } from 'grammy'
import { Types } from 'mongoose'
import { SUPPORT_GROUP_ID } from '../config/env.js'
import { SupportTicketModel } from '../models/SupportTicket.js'
import { SupportMessageModel } from '../models/SupportMessage.js'
import { TeamModel } from '../models/Team.js'
import { UserModel } from '../models/User.js'
import { auditLogService } from './auditLog.service.js'
import { PaymentModel } from '../models/Payment.js'
import { supportContextText, type SupportMetadata } from './supportContext.js'
import { ConversationModel } from '../models/Conversation.js'

export const SUPPORT_AUTO_CLOSE_HOURS = Math.max(
  1,
  Number(process.env.SUPPORT_AUTO_CLOSE_HOURS || 1) || 1
)

function messagePayload(ctx: Context) {
  const message: any = ctx.message
  const attachments: Array<{
    type: 'image' | 'document' | 'video'
    telegramFileId: string
    fileName?: string
    mimeType?: string
  }> = []
  if (message?.photo?.length)
    attachments.push({ type: 'image', telegramFileId: message.photo.at(-1).file_id })
  if (message?.document)
    attachments.push({
      type: 'document',
      telegramFileId: message.document.file_id,
      fileName: message.document.file_name,
      mimeType: message.document.mime_type,
    })
  if (message?.video)
    attachments.push({
      type: 'video',
      telegramFileId: message.video.file_id,
      fileName: message.video.file_name,
      mimeType: message.video.mime_type,
    })
  return { text: message?.text || message?.caption || null, attachments }
}

export function buildSupportTopicKeyboard(input: {
  ticketId: string
  userId: number
  status: 'open' | 'closed'
  teams: Array<{ id?: string; _id?: unknown; name: string }>
}) {
  const keyboard = new InlineKeyboard()
    .text('👤 Профиль и управление', `support:profile:${input.userId}`)
    .row()
  for (const team of input.teams) {
    keyboard
      .text(
        `👥 Открыть команду «${team.name}»`.slice(0, 60),
        `support:team:${team.id || String(team._id)}`
      )
      .row()
  }
  keyboard
    .url('✉️ Открыть Telegram-профиль', `tg://user?id=${input.userId}`)
    .row()
    .text(
      input.status === 'open' ? '✅ Завершить обращение' : '🔓 Возобновить обращение',
      input.status === 'open'
        ? `support:close:${input.ticketId}`
        : `support:reopen:${input.ticketId}`
    )
  return keyboard
}

async function updateSupportTopicKeyboard(api: Api, ticket: any, status: 'open' | 'closed') {
  if (!ticket.cardMessageId) return false
  const teams = await TeamModel.find({
    $or: [{ ownerId: ticket.userId }, { 'members.telegramId': ticket.userId }],
  }).select('name')
  await api.editMessageReplyMarkup(SUPPORT_GROUP_ID, ticket.cardMessageId, {
    reply_markup: buildSupportTopicKeyboard({
      ticketId: ticket.id,
      userId: ticket.userId,
      status,
      teams,
    }),
  })
  return true
}

export async function saveSupportMessage(input: {
  ticketId: string
  senderType: 'user' | 'admin' | 'system'
  senderId?: number
  text?: string | null
  attachments?: Array<{
    type: 'image' | 'document' | 'video'
    telegramFileId: string
    fileName?: string
    mimeType?: string
  }>
  source: 'telegram' | 'web'
  telegramSourceMessageId?: number
  telegramDestinationMessageId?: number
}) {
  const message = await SupportMessageModel.findOneAndUpdate(
    input.telegramSourceMessageId
      ? {
          ticketId: input.ticketId,
          source: input.source,
          telegramSourceMessageId: input.telegramSourceMessageId,
          senderType: input.senderType,
        }
      : { _id: new Types.ObjectId() },
    { $setOnInsert: input },
    { upsert: true, new: true, runValidators: true }
  )
  const activityAt = new Date()
  await SupportTicketModel.updateOne(
    { _id: input.ticketId, status: 'open' },
    { $set: { updatedAt: activityAt, lastActivityAt: activityAt } }
  )
  await auditLogService.createLog({
    type: input.senderType === 'admin' ? 'support.message_admin' : 'support.message_user',
    actorType: input.senderType === 'admin' ? 'admin' : 'user',
    actorTelegramId: input.senderId,
    metadata: {
      ticketId: input.ticketId,
      source: input.source,
      hasAttachments: Boolean(input.attachments?.length),
    },
  })
  return message
}

export function listSupportTicketsForUser(userId: number) {
  return SupportTicketModel.find({ userId }).sort({ updatedAt: -1 })
}

export function listAllSupportTickets() {
  return SupportTicketModel.find().sort({ updatedAt: -1 })
}

export async function getSupportTicketWithMessages(ticketId: string, ownerId?: number) {
  const ticket = await SupportTicketModel.findOne({
    _id: ticketId,
    ...(ownerId === undefined ? {} : { userId: ownerId }),
  })
  if (!ticket) return null
  const messages = await SupportMessageModel.find({ ticketId: ticket._id }).sort({ createdAt: 1 })
  return { ticket, messages }
}

async function setDeliveryReaction(ctx: Context, delivered: boolean) {
  try {
    await ctx.react(delivered ? '👍' : '👎')
  } catch (error) {
    // Реакции могут быть отключены настройками конкретного чата.
    console.error('Не удалось поставить реакцию на сообщение:', error)
  }
}

export function copyConversationMessage(
  ctx: Context,
  targetChatId: number,
  messageThreadId?: number
) {
  return ctx.api.copyMessage(targetChatId, ctx.chat!.id, ctx.message!.message_id, {
    message_thread_id: messageThreadId,
  })
}

export async function deliverUserMessageToAdmin(
  ctx: Context,
  adminChatId: number,
  adminThreadId?: number
) {
  try {
    const delivered = await copyConversationMessage(ctx, adminChatId, adminThreadId)
    await setDeliveryReaction(ctx, true)
    return delivered
  } catch (error) {
    console.error('Не удалось доставить сообщение пользователя:', error)
    await setDeliveryReaction(ctx, false)
    await ctx.reply('⚠️ Не удалось доставить сообщение. Попробуйте ещё раз чуть позже.')
    return null
  }
}

/** Общая Telegram-доставка ответа администратора без изменения содержимого сообщения. */
export async function deliverAdminMessageToUser(
  ctx: Context,
  targetUserId: number,
  afterDelivery?: (delivered: { message_id: number }) => Promise<void>
) {
  try {
    const delivered = await copyConversationMessage(ctx, targetUserId)
    if (afterDelivery) await afterDelivery(delivered)
    await setDeliveryReaction(ctx, true)
    return delivered
  } catch (error) {
    console.error('Не удалось доставить сообщение администратора:', error)
    await setDeliveryReaction(ctx, false)
    await ctx.reply('⚠️ Не удалось доставить сообщение пользователю.')
    return null
  }
}

export async function getOpenSupportTicket(userId: number) {
  return SupportTicketModel.findOne({ userId, status: 'open' }).sort({ createdAt: -1 })
}

const ticketCreationLocks = new Map<number, Promise<any>>()

async function syncSupportConversation(ticket: any) {
  if (ConversationModel.db.readyState !== 1) return null
  const conversation = await ConversationModel.findOneAndUpdate(
    { type: 'support', contextId: ticket.id },
    {
      $set: {
        userId: ticket.userId,
        status: ticket.status,
        adminChatId: SUPPORT_GROUP_ID,
        adminThreadId: ticket.threadId,
        adminMessageId: ticket.cardMessageId || null,
        lastActivityAt: ticket.lastActivityAt || ticket.updatedAt || new Date(),
        closedAt: ticket.closedAt || null,
        closeReason: ticket.closeReason || null,
      },
      $setOnInsert: { openedBy: 'user', userActive: false },
    },
    { upsert: true, new: true, runValidators: true }
  )
  if (!ticket.conversationId || String(ticket.conversationId) !== conversation.id) {
    ticket.conversationId = conversation._id
    await ticket.save()
  }
  return conversation
}

async function contextDetails(metadata?: SupportMetadata) {
  if (!metadata) return ''
  const [payment, team] = await Promise.all([
    metadata.paymentId ? PaymentModel.findById(metadata.paymentId) : null,
    metadata.teamId ? TeamModel.findById(metadata.teamId) : null,
  ])
  return supportContextText(metadata, payment, team)
}

async function applySupportContext(api: Api, ticket: any, metadata?: SupportMetadata) {
  if (!metadata || isDeepStrictEqual(ticket.metadata?.toObject?.() || ticket.metadata, metadata)) return ticket
  // Keep previous context in the topic history when reusing an open ticket.
  await api.sendMessage(SUPPORT_GROUP_ID, `💬 Контекст обращения обновлён\n\n${await contextDetails(metadata)}`, {
    message_thread_id: ticket.threadId,
  })
  ticket.metadata = metadata
  await ticket.save()
  return ticket
}

export async function createSupportTicketForUser(
  api: Api,
  userId: number,
  telegramProfile?: { username?: string },
  metadata?: SupportMetadata
) {
  const existing = await getOpenSupportTicket(userId)
  if (existing) {
    await syncSupportConversation(existing)
    return applySupportContext(api, existing, metadata)
  }
  const inflight = ticketCreationLocks.get(userId)
  if (inflight) return applySupportContext(api, await inflight, metadata)

  const creation = (async () => {
    const rechecked = await getOpenSupportTicket(userId)
    if (rechecked) {
      await syncSupportConversation(rechecked)
      return applySupportContext(api, rechecked, metadata)
    }
    const profile =
      (await UserModel.findOne({ telegramId: userId })) ||
      (await UserModel.create({ telegramId: userId, reg: 'none', regStep: 'fio' }))
    const teams = await TeamModel.find({
      $or: [{ ownerId: userId }, { 'members.telegramId': userId }],
    }).select('name ownerId members')
    const username = telegramProfile?.username ? `@${telegramProfile.username}` : `ID ${userId}`
    const topic = await api.createForumTopic(
      SUPPORT_GROUP_ID,
      `🆘 ${(profile.fio || username).slice(0, 70)}`
    )
    try {
      const ticket = await SupportTicketModel.create({
        userId,
        threadId: topic.message_thread_id,
        lastActivityAt: new Date(),
        ...(metadata ? { metadata } : {}),
      })
      const details = [
        '🆘 Новое обращение',
        await contextDetails(metadata),
        `👤 ${profile.fio || 'Имя не указано'}`,
        telegramProfile?.username ? `🔗 @${telegramProfile.username}` : null,
        `🆔 ID: ${userId}`,
        `🏙 Город: ${profile.city || 'не указан'}`,
        `⛪ Церковь: ${profile.church || 'не указана'}`,
        '',
        '👥 Команды:',
        ...(teams.length
          ? teams.map(
              (team) =>
                `• ${team.name} — ${team.ownerId === userId ? 'владелец' : 'участник'} (${team.members?.length || 0}/5)`
            )
          : ['• Не состоит в команде']),
        '',
        '💬 Чтобы ответить пользователю, просто отправьте сообщение в этом топике.',
      ]
        .filter(Boolean)
        .join('\n')
      const keyboard = buildSupportTopicKeyboard({
        ticketId: ticket.id,
        userId,
        status: 'open',
        teams,
      })
      const card = await api.sendMessage(SUPPORT_GROUP_ID, details, {
        message_thread_id: ticket.threadId,
        reply_markup: keyboard,
      })
      ticket.cardMessageId = card.message_id
      await ticket.save()
      await syncSupportConversation(ticket)
      return ticket
    } catch (error: any) {
      await api.closeForumTopic(SUPPORT_GROUP_ID, topic.message_thread_id).catch(() => {})
      if (error?.code === 11000) {
        const winner = await getOpenSupportTicket(userId)
        if (winner) return applySupportContext(api, winner, metadata)
      }
      throw error
    }
  })().finally(() => ticketCreationLocks.delete(userId))
  ticketCreationLocks.set(userId, creation)
  return creation
}

export async function createSupportTicket(ctx: Context, userId: number) {
  const session = (ctx as Context & { session?: { supportDraft?: import('./supportContext.js').SupportDraft } }).session
  const draft = session?.supportDraft
  const ticket = await createSupportTicketForUser(ctx.api, userId, { username: ctx.from?.username }, draft?.step === 'message' ? draft.metadata : undefined)
  if (session && session.supportDraft === draft) session.supportDraft = undefined
  return ticket
}

export async function sendUserMessageToSupport(ctx: Context, userId: number) {
  const ticket = await createSupportTicket(ctx, userId)
  const delivered = await copyConversationMessage(ctx, SUPPORT_GROUP_ID, ticket.threadId)
  const payload = messagePayload(ctx)
  await saveSupportMessage({
    ticketId: ticket.id,
    senderType: 'user',
    senderId: userId,
    source: 'telegram',
    telegramSourceMessageId: ctx.message!.message_id,
    telegramDestinationMessageId: delivered.message_id,
    ...payload,
  })
  return ticket
}

export async function closeSupportTicket(api: Api, ticketId: string, closedBy: 'user' | 'admin') {
  const ticket = await SupportTicketModel.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    { status: 'closed', closedBy, closeReason: 'manual', closedAt: new Date() },
    { new: true }
  )
  if (!ticket) return null
  await syncSupportConversation(ticket)

  await updateSupportTopicKeyboard(api, ticket, 'closed').catch((error) =>
    console.error('Не удалось обновить клавиатуру support-карточки:', error)
  )

  const notification =
    closedBy === 'admin'
      ? '🔒 Обращение завершено\n\nВаше обращение было завершено службой поддержки.\n\nЕсли потребуется помощь снова —\nвы всегда можете создать новое обращение.'
      : '✅ Пользователь завершил обращение.'

  if (closedBy === 'admin') await api.sendMessage(ticket.userId, notification)
  else {
    await api.sendMessage(SUPPORT_GROUP_ID, notification, { message_thread_id: ticket.threadId })
  }

  try {
    await api.closeForumTopic(SUPPORT_GROUP_ID, ticket.threadId)
  } catch (error) {
    console.error('Не удалось закрыть тему поддержки:', error)
  }
  return ticket
}

export async function reopenSupportTicket(api: Api, ticketId: string, adminTelegramId: number) {
  const now = new Date()
  const ticket = await SupportTicketModel.findOneAndUpdate(
    { _id: ticketId, status: 'closed' },
    {
      $set: {
        status: 'open',
        reopenedAt: now,
        reopenedBy: adminTelegramId,
        lastActivityAt: now,
      },
      $unset: { closedAt: '', closedBy: '', closeReason: '' },
    },
    { new: true }
  )
  if (!ticket) return null
  await syncSupportConversation(ticket)

  await api.reopenForumTopic(SUPPORT_GROUP_ID, ticket.threadId).catch((error) =>
    console.error('Не удалось открыть тему поддержки:', error)
  )
  await updateSupportTopicKeyboard(api, ticket, 'open').catch((error) =>
    console.error('Не удалось обновить клавиатуру support-карточки:', error)
  )

  let userNotified = true
  await api
    .sendMessage(
      ticket.userId,
      '🔓 Ваше обращение снова открыто\n\nВы можете продолжить общение с поддержкой.'
    )
    .catch(() => {
      userNotified = false
    })
  await api.sendMessage(
    SUPPORT_GROUP_ID,
    `🔓 Обращение возобновлено\n\nАдминистратор снова открыл обращение.${
      userNotified ? '' : '\n\n⚠️ Не удалось доставить уведомление пользователю.'
    }`,
    { message_thread_id: ticket.threadId }
  )
  return ticket
}

/** Атомарно забирает только ещё открытые просроченные обращения. Поэтому
 * параллельные/повторные worker runs не дублируют закрытие и уведомления. */
export async function autoCloseInactiveSupportTickets(api: Api, now = new Date()) {
  const cutoff = new Date(now.getTime() - SUPPORT_AUTO_CLOSE_HOURS * 60 * 60 * 1000)
  const candidates = await SupportTicketModel.find({
    status: 'open',
    $or: [
      { lastActivityAt: { $lte: cutoff } },
      { lastActivityAt: null, updatedAt: { $lte: cutoff } },
      { lastActivityAt: { $exists: false }, updatedAt: { $lte: cutoff } },
      { lastActivityAt: null, updatedAt: null, createdAt: { $lte: cutoff } },
    ],
  }).select({ _id: 1 })

  let closed = 0
  for (const candidate of candidates) {
    const ticket = await SupportTicketModel.findOneAndUpdate(
      { _id: candidate._id, status: 'open' },
      { $set: { status: 'closed', closedBy: 'system', closeReason: 'inactivity', closedAt: now } },
      { new: true }
    )
    if (!ticket) continue
    await syncSupportConversation(ticket)
    closed += 1
    await updateSupportTopicKeyboard(api, ticket, 'closed').catch((error) =>
      console.error('Не удалось обновить клавиатуру support-карточки:', error)
    )
    let userNotified = true
    await api
      .sendMessage(
        ticket.userId,
        '🔒 Обращение закрыто автоматически\n\nВ чате не было активности больше часа,\nпоэтому обращение было закрыто.\n\nЕсли помощь понадобится снова —\nпросто напишите нам или обратитесь в поддержку ещё раз.'
      )
      .catch((error) => {
        userNotified = false
        console.error('Не удалось уведомить пользователя об auto-close:', error)
      })
    await api
      .sendMessage(
        SUPPORT_GROUP_ID,
        `🔒 Обращение закрыто автоматически\n\nПричина:\nнет активности более 1 часа.\n\n${
          userNotified
            ? 'Пользователь уведомлён.'
            : '⚠️ Не удалось доставить уведомление пользователю.'
        }`,
        { message_thread_id: ticket.threadId }
      )
      .catch((error) => console.error('Не удалось уведомить support topic об auto-close:', error))
    await api
      .closeForumTopic(SUPPORT_GROUP_ID, ticket.threadId)
      .catch((error) => console.error('Не удалось закрыть тему поддержки:', error))
    await auditLogService.createLog({
      type: 'support.auto_closed',
      actorType: 'system',
      targetUserId: ticket.userId,
      metadata: {
        ticketId: ticket.id,
        threadId: ticket.threadId,
        inactivityHours: SUPPORT_AUTO_CLOSE_HOURS,
      },
    })
  }
  return closed
}

export async function closeOpenTicketForUser(api: Api, userId: number) {
  const ticket = await getOpenSupportTicket(userId)
  if (!ticket) return null
  return closeSupportTicket(api, ticket.id, 'user')
}

export async function relayAdminMessage(ctx: Context) {
  if (ctx.chat?.id !== SUPPORT_GROUP_ID || !ctx.message?.message_thread_id) return false
  if (!ctx.from || ctx.from.is_bot) return true

  const ticket = await SupportTicketModel.findOne({
    threadId: ctx.message.message_thread_id,
    status: 'open',
  })
  if (!ticket) return true

  const adminId = ctx.from.id
  const sourceMessageId = ctx.message.message_id

  await deliverAdminMessageToUser(ctx, ticket.userId, async (delivered) => {
    const payload = messagePayload(ctx)
    await saveSupportMessage({
      ticketId: ticket.id,
      senderType: 'admin',
      senderId: adminId,
      source: 'telegram',
      telegramSourceMessageId: sourceMessageId,
      telegramDestinationMessageId: delivered.message_id,
      ...payload,
    })
  })
  return true
}
