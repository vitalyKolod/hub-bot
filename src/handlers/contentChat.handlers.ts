import { InlineKeyboard } from 'grammy'
import type { CbData } from '../core/callback.js'
import type { MyContext } from '../types/context.js'
import { getProduct } from '../config/products.js'
import { getTeamById } from '../services/team.service.js'
import { createProtectedChatInvite } from '../services/groupJoinAccess.service.js'

export async function handleContentChat(ctx: MyContext, userId: number, parsed: CbData) {
  const teamId = typeof parsed.p === 'string' ? parsed.p : ''
  const product = getProduct(parsed.m || '')
  if (!/^[a-f\d]{24}$/i.test(teamId) || !product?.cartable) {
    await ctx.answerCallbackQuery({ text: 'Чат не найден.', show_alert: true })
    return
  }
  const team = await getTeamById(teamId)
  const belongs = team && (team.ownerId === userId || team.members.some(
    member => member.telegramId === userId && member.status === 'active'
  ))
  const sub = team?.subscriptions.get(product.id)
  if (!belongs || sub?.status !== 'active' || !sub.expiresAt || new Date(sub.expiresAt).getTime() <= Date.now()) {
    await ctx.answerCallbackQuery({ text: 'Для входа нужна действующая подписка вашей команды.', show_alert: true })
    return
  }
  if (!Number.isSafeInteger(product.groupId) || Number(product.groupId) >= 0) {
    await ctx.answerCallbackQuery({ text: 'Чат пока не настроен. Обратитесь в поддержку.', show_alert: true })
    return
  }
  await ctx.answerCallbackQuery()
  try {
    const invite = await createProtectedChatInvite(ctx.api, product.id, userId)
    if (!invite) {
      await ctx.reply('Не удалось подтвердить доступ к чату. Проверьте подписку команды.')
      return
    }
    await ctx.reply(`Чат — ${product.name}\n\nСсылка действует 1 час. Нажмите кнопку и отправьте заявку — бот проверит подписку и одобрит вступление. Если ссылка истечёт, нажмите кнопку чата в карточке команды снова.`, {
      reply_markup: new InlineKeyboard().url('Вступить в чат', invite.invite_link),
    })
  } catch (error: any) {
    console.error('[content-chat] Invitation failed', { productId: product.id, reason: error?.description || error?.name || 'unknown' })
    await ctx.reply('Не удалось получить ссылку на чат. Попробуйте ещё раз или обратитесь в поддержку.')
  }
}
