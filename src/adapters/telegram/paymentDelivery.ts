import type { Api } from 'grammy'
import { getProduct } from '../../config/products.js'
import { getTeamById } from '../../services/team.service.js'
import type { PaymentDecisionResult } from '../../services/payment.service.js'
import { recordOperationalEvent } from '../../services/auditLog.service.js'
import { createProtectedChatInvite } from '../../services/groupJoinAccess.service.js'

export async function deliverAcceptedPayment(api: Api, result: PaymentDecisionResult, botUsername?: string) {
  if (!result.applied) return
  const payment = result.payment
  const team = await getTeamById(payment.teamId)
  if (!team) throw new Error('Team not found for payment delivery')
  const product = getProduct(payment.productId)
  if (payment.renewalCampaignId) {
    const { getRenewalCampaign } = await import('../../services/proPresenterRenewal.service.js')
    const campaign = await getRenewalCampaign(payment.renewalCampaignId)
    await api.sendMessage(team.ownerId,
      `✅ Взнос за продление ProPresenter подтверждён.\nПоток №${campaign?.flowNumber || '—'} · команда «${team.name}».\nУстройств оплачено: ${payment.renewalDeviceIds?.length || 1}.\n\nКогда общий поток будет продлён, новая дата появится в боте.`)
    return
  }
  if (payment.productId === 'add_member' && result.teamInviteCode) {
    const username = botUsername || (await api.getMe()).username
    const inviteLink = `https://t.me/${username}?start=join_${result.teamInviteCode}`
    await api.sendMessage(team.ownerId, `✅ Оплата подтверждена!\n\nВот персональная ссылка-приглашение для нового участника:\n${inviteLink}\n\n⚠️ Ссылка одноразовая.\n\nЧтобы вернуться в меню команд, нажмите /team_list`)
    return
  }
  if (product?.groupId) {
    const invite = await createProtectedChatInvite(api, payment.productId, team.ownerId)
    if (!invite) throw new Error('Active team access required for chat invitation')
    await api.sendMessage(team.ownerId, `✅ ${result.isExtension ? 'Продлено' : 'Подписка активирована:'} ${product.name}\n\nСсылка для заявки в чат действует 1 час. Бот проверит ваш Telegram ID перед вступлением 👇\n\n${invite.invite_link}\n\nНовую ссылку всегда можно получить в карточке команды.`)
    await recordOperationalEvent({
      type: 'access.invite_issued', actorType: 'system', targetUserId: team.ownerId,
      targetTeamId: String(team._id), targetPaymentId: payment.id,
      targetSubscriptionId: `${team._id}:${payment.productId}`,
      metadata: { groupId: product.groupId, productId: payment.productId,
        result: 'Telegram API принял ссылку; вступление неизвестно',
        reason: result.isExtension ? 'восстановление или продление доступа' : 'активация подписки' },
    })
    return
  }
  await api.sendMessage(team.ownerId, `✅ Подписка активирована: ${product?.name || payment.productId}\nЧтобы вернуться, нажмите /team_list`)
}

export async function deliverRejectedPayment(api: Api, result: PaymentDecisionResult) {
  if (!result.applied) return
  const team = await getTeamById(result.payment.teamId)
  if (!team) return
  const product = getProduct(result.payment.productId)
  await api.sendMessage(
    team.ownerId,
    `❌ ОПЛАТА НЕ ПОДТВЕРЖДЕНА\n\n${product?.name || result.payment.productId}\n\nПричина:\n${result.payment.rejectionReason}\n\nЕсли считаете, что произошла ошибка, свяжитесь с нами — мы поможем разобраться.`,
    { reply_markup: { inline_keyboard: [[{ text: '💬 Написать в поддержку', callback_data: `s2:reject:${result.payment.id || result.payment._id}` }]] } }
  )
}
