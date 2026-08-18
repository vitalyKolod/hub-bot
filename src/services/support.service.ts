import { InlineKeyboard, type Api, type Context } from 'grammy'
import { SUPPORT_GROUP_ID } from '../config/env.js'
import { SupportTicketModel } from '../models/SupportTicket.js'
import { TeamModel } from '../models/Team.js'
import { getOrCreateUser } from './user.service.js'

async function setDeliveryReaction(ctx: Context, delivered: boolean) {
  try {
    await ctx.react(delivered ? '👍' : '👎')
  } catch (error) {
    // Реакции могут быть отключены настройками конкретного чата.
    console.error('Не удалось поставить реакцию на сообщение:', error)
  }
}

export async function getOpenSupportTicket(userId: number) {
  return SupportTicketModel.findOne({ userId, status: 'open' }).sort({ createdAt: -1 })
}

export async function createSupportTicket(ctx: Context, userId: number) {
  const existing = await getOpenSupportTicket(userId)
  if (existing) return existing

  const profile = await getOrCreateUser(userId)
  const teams = await TeamModel.find({
    $or: [{ ownerId: userId }, { 'members.telegramId': userId }],
  }).select('name ownerId members')
  const username = ctx.from?.username ? `@${ctx.from.username}` : `ID ${userId}`
  const titleName = (profile.fio || username).slice(0, 70)
  const topic = await ctx.api.createForumTopic(SUPPORT_GROUP_ID, `🆘 ${titleName}`)

  const ticket = await SupportTicketModel.create({
    userId,
    threadId: topic.message_thread_id,
  })

  const teamDetails = teams.length
    ? teams.map((team) => {
        const role = team.ownerId === userId ? 'владелец' : 'участник'
        return `• ${team.name} — ${role} (${team.members.length}/5)`
      })
    : ['• Не состоит в команде']

  const details = [
    '🆘 Новое обращение',
    `👤 ${profile.fio || 'Имя не указано'}`,
    ctx.from?.username ? `🔗 @${ctx.from.username}` : null,
    `🆔 ID: ${userId}`,
    `🏙 Город: ${profile.city || 'не указан'}`,
    `⛪ Церковь: ${profile.church || 'не указана'}`,
    `📋 Регистрация: ${profile.reg === 'done' ? 'завершена' : 'не завершена'}`,
    '',
    '👥 Команды:',
    ...teamDetails,
    '',
    '💬 Чтобы ответить пользователю, просто отправьте сообщение в этом топике.',
  ]
    .filter(Boolean)
    .join('\n')

  const keyboard = new InlineKeyboard()
    .text('👤 Профиль и управление', `support:profile:${userId}`)
    .row()

  for (const team of teams) {
    keyboard
      .text(`👥 Открыть команду «${team.name}»`.slice(0, 60), `support:team:${team.id}`)
      .row()
  }

  keyboard
    .url('✉️ Открыть Telegram-профиль', `tg://user?id=${userId}`)
    .row()
    .text('✅ Завершить обращение', `support:close:${ticket.id}`)
  await ctx.api.sendMessage(SUPPORT_GROUP_ID, details, {
    message_thread_id: ticket.threadId,
    reply_markup: keyboard,
  })

  return ticket
}

export async function sendUserMessageToSupport(ctx: Context, userId: number) {
  const ticket = await createSupportTicket(ctx, userId)
  await ctx.api.copyMessage(SUPPORT_GROUP_ID, ctx.chat!.id, ctx.message!.message_id, {
    message_thread_id: ticket.threadId,
  })
  return ticket
}

export async function closeSupportTicket(
  api: Api,
  ticketId: string,
  closedBy: 'user' | 'admin'
) {
  const ticket = await SupportTicketModel.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    { status: 'closed', closedBy, closedAt: new Date() },
    { new: true }
  )
  if (!ticket) return null

  const notification =
    closedBy === 'admin'
      ? '✅ Специалист завершил обращение. Если понадобится помощь, создайте новое.'
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

  try {
    await ctx.api.copyMessage(ticket.userId, SUPPORT_GROUP_ID, ctx.message.message_id)
    await setDeliveryReaction(ctx, true)
  } catch (error) {
    console.error('Не удалось доставить ответ поддержки:', error)
    await setDeliveryReaction(ctx, false)
    await ctx.reply('⚠️ Не удалось доставить сообщение пользователю.')
  }
  return true
}
