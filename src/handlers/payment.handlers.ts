import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'
import { PAYMENT_ICONS } from '../ui/emoji/icons.js'
import { Types } from 'mongoose'
import { packCb } from '../core/callback.js'
import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { escapeUnderscore } from '../utils/escape.js'
import { getOrCreateUser } from '../services/user.service.js'
import {
  getTeamById,
  activateTeamSubscription,
  hasActiveTeamSubscription,
  isTeamProductPurchaseLocked,
} from '../services/team.service.js'
import { getProduct } from '../config/products.js'
import { createTeamInvite } from '../services/teamInvite.service.js'
import { markCartInReview, getOrCreateCart } from '../services/cart.service.js'
import { ADMIN_GROUP_ID } from '../config/env.js'
import type { MyContext } from '../types/context.js'
import { auditLogService, recordOperationalEvent } from '../services/auditLog.service.js'
import { acceptPayment, attachPaymentTelegramLocation, createPayment, getPayment, getPaymentsForAdminMessage, PaymentNotFoundError, rejectPayment, returnPaymentToPending } from '../services/payment.service.js'
import { deliverAcceptedPayment, deliverRejectedPayment } from '../adapters/telegram/paymentDelivery.js'
import { createProtectedChatInvite } from '../services/groupJoinAccess.service.js'
import { appendConversationContactButtons } from '../services/conversation.service.js'
import { eligibleSeats, getPayableRenewalForFlow, getRenewalCampaign, getRenewalSeat, renewalAcceptsNewPayments, setRenewalPaymentStatus, syncRenewalSummary } from '../services/proPresenterRenewal.service.js'
import { ProPresenterDeviceModel } from '../models/ProPresenterDevice.js'
import { sendDeviceChoices } from './proPresenterRenewal.handlers.js'

export async function startRenewalCheckout(ctx: MyContext, campaignId: string, teamId: string) {
  const userId = ctx.from!.id
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || !renewalAcceptsNewPayments(campaign)) throw new Error('Приём взносов этого сбора закрыт')
  const seats = await eligibleSeats(campaignId, userId)
  const seat = seats.find((item) => item.teamId === teamId)
  if (!seat) throw new Error('Оплатить может только владелец подписки этой команды')
  if (campaign.billingMode !== 'device') throw new Error('Этот сбор создан до учёта устройств. Попросите администратора обновить сбор')
  if (seat.paymentStatus === 'paid') throw new Error('Взнос за эту команду уже подтверждён')
  if (seat.paymentStatus === 'pending') throw new Error('Чек этой команды уже находится на проверке')
  const renewalDeviceIds = seat.devices.filter((device) => device.active !== false && device.paymentStatus === 'none' && device.vote === 'yes' && device.deviceId).map((device) => device.deviceId!)
  if (!renewalDeviceIds.length) throw new Error('Нет устройств для оплаты')
  ctx.session.payment = {
    paymentId: new Types.ObjectId().toString(),
    product: 'propresenter', teamId, renewalCampaignId: campaignId, renewalDeviceIds, method: null,
  }
  goTo(userId, 'payment')
  await renderScreen(ctx, userId, 'payment', undefined, { forceNew: true })
}

export function paymentProductLine(productId: string): FormattedString {
  const product = getProduct(productId)
  let line = new FormattedString('').plain('• ')
  if (product?.customEmojiId) line = line.emoji('📦', product.customEmojiId).plain(' ')
  return line.plain(product?.name || productId)
}

export function paymentCard(input: { operation: string; productIds: string[]; owner: string; username: string; userId: number; team: string; teamId: string; method: string; time: string }): FormattedString {
  let card = new FormattedString('').emoji('💰', PAYMENT_ICONS.payment).bold(' ОПЛАТА: ')
  card = card.emoji('🆕', PAYMENT_ICONS.newSubscription).bold(` ${input.operation.toUpperCase()}`)
    .plain('\n━━━━━━━━━━━━━━\n📦 Товары:\n')
  for (const id of input.productIds) card = card.concat(paymentProductLine(id)).plain('\n')
  return card.plain('━━━━━━━━━━━━━━\n')
    .emoji('👤', PAYMENT_ICONS.owner).plain(` Владелец: ${input.owner}\n`)
    .emoji('😎', PAYMENT_ICONS.username).plain(` Юзернейм: ${input.username}\n`)
    .emoji('🆔', PAYMENT_ICONS.id).plain(` ID: ${input.userId}\n`)
    .emoji('👥', PAYMENT_ICONS.team).plain(` Команда: ${input.team}\n`)
    .emoji('🆔', PAYMENT_ICONS.id).plain(` Team ID: ${input.teamId}\n`)
    .plain(`━━━━━━━━━━━━━━\n💳 Способ оплаты: ${input.method}\n🕒 Время: ${input.time}\n\n━━━━━━━━━━━━━━\nПроверь и подтверди вручную! `)
    .emoji('👇', PAYMENT_ICONS.confirm)
}

const PAYMENT_REJECTION_REASONS: Record<string, string> = {
  transfer: 'Не найден перевод',
  amount: 'Неверная сумма',
  unreadable: 'Не читается чек',
  receipt: 'Неверный чек',
}

export async function fullAdminPaymentKeyboard(payment: any) {
  const payments = payment.telegramAdminMessageId
    ? await getPaymentsForAdminMessage(payment.telegramAdminMessageId)
    : [payment]
  const kb = new InlineKeyboard()
  for (const item of payments) {
    if (item.status === 'pending') {
      if (item.cartItemId) {
        kb.text(`✅ ${getProduct(item.productId)?.name || item.productId}`, packCb({ a: 'cart_accept', p: item.id }))
          .text('❌', packCb({ a: 'cart_reject', p: item.id })).row()
      } else {
        kb.text('✅ Подтвердить', packCb({ a: 'accept', p: item.teamId }))
          .text('❌ Отклонить', packCb({ a: 'reject', p: item.id })).row()
      }
    } else if (item.status === 'accepted') {
      kb.text('✅ Принято', packCb({ a: 'noop' })).row()
    } else if (item.status === 'rejected') {
      kb.text(`↩️ Вернуть ${getProduct(item.productId)?.name || item.productId} на проверку`, packCb({ a: 'payment_retry', p: item.id })).row()
    }
  }
  if (payment.userId) {
    appendConversationContactButtons(kb, 'payment', payment.id, payment.userId)
  }
  return kb
}

export async function showPaymentRejectReasons(ctx: MyContext, paymentId: string) {
  const payment = await getPayment(paymentId)
  if (!payment || payment.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: payment ? `Статус: ${payment.status}` : 'Оплата не найдена', show_alert: true })
    return
  }
  const kb = new InlineKeyboard()
    .text('💸 Не найден перевод', packCb({ a: 'payment_reject_reason', p: `${paymentId}:transfer` })).row()
    .text('🔢 Неверная сумма', packCb({ a: 'payment_reject_reason', p: `${paymentId}:amount` })).row()
    .text('🧾 Не читается чек', packCb({ a: 'payment_reject_reason', p: `${paymentId}:unreadable` })).row()
    .text('📎 Неверный чек', packCb({ a: 'payment_reject_reason', p: `${paymentId}:receipt` })).row()
    .text('✏️ Другая причина', packCb({ a: 'payment_reject_custom', p: paymentId })).row()
    .text('← Назад', packCb({ a: 'payment_reject_back', p: paymentId }))
  await ctx.editMessageReplyMarkup({ reply_markup: kb })
  await ctx.answerCallbackQuery({ text: 'Выберите причину отклонения' })
}

async function finishPaymentReject(ctx: MyContext, paymentId: string, reason: string) {
  const decision = await rejectPayment(paymentId, ctx.from!.id, reason)
  if (!decision.applied) {
    await ctx.answerCallbackQuery({ text: decision.payment.status === 'rejected' ? 'Уже отклонено' : `Статус: ${decision.payment.status}`, show_alert: true })
    return
  }
  await deliverRejectedPayment(ctx.api, decision)
  if (decision.payment.renewalCampaignId) {
    await syncRenewalSummary(ctx.api, decision.payment.renewalCampaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  const msg = ctx.callbackQuery?.message
  const caption = msg && 'caption' in msg ? msg.caption || '' : ''
  if (msg && caption) {
    await ctx.api.editMessageCaption(msg.chat.id, msg.message_id, {
      caption: `${caption}\n\n❌ Отклонено\nПричина: ${reason}`,
      caption_entities: 'caption_entities' in msg ? msg.caption_entities : undefined,
      reply_markup: await fullAdminPaymentKeyboard(decision.payment),
    })
  }
  await ctx.answerCallbackQuery({ text: 'Отклонено ✗' })
}

export async function handlePaymentRejectReason(ctx: MyContext, payload: string) {
  const separator = payload.lastIndexOf(':')
  const paymentId = payload.slice(0, separator)
  const reason = PAYMENT_REJECTION_REASONS[payload.slice(separator + 1)]
  if (!reason) return ctx.answerCallbackQuery({ text: 'Неизвестная причина', show_alert: true })
  await finishPaymentReject(ctx, paymentId, reason)
}

export async function startCustomPaymentReject(ctx: MyContext, paymentId: string) {
  const msg = ctx.callbackQuery?.message
  if (!msg) return
  ctx.session.paymentReject = { paymentId, chatId: msg.chat.id, messageId: msg.message_id }
  ctx.session.waitingForPaymentRejectReason = true
  await ctx.answerCallbackQuery()
  await ctx.reply('Введите причину отклонения.')
}

export async function handleCustomPaymentRejectText(ctx: MyContext) {
  const state = ctx.session.paymentReject
  if (!state || !ctx.session.waitingForPaymentRejectReason) return false
  const reason = ctx.message?.text?.trim()
  if (!reason) return true
  ctx.session.paymentReject = undefined
  ctx.session.waitingForPaymentRejectReason = false
  const payment = await rejectPayment(state.paymentId, ctx.from!.id, reason)
  await deliverRejectedPayment(ctx.api, payment)
  if (payment.payment.renewalCampaignId) {
    await syncRenewalSummary(ctx.api, payment.payment.renewalCampaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  const stored = await getPayment(state.paymentId)
  await ctx.api.editMessageReplyMarkup(state.chatId, state.messageId, {
    reply_markup: stored ? await fullAdminPaymentKeyboard(stored) : undefined,
  }).catch(() => {})
  await ctx.reply(stored?.status === 'rejected' ? 'Оплата отклонена.' : `Статус оплаты: ${stored?.status}`)
  return true
}

export async function handlePaymentRejectBack(ctx: MyContext, paymentId: string) {
  const payment = await getPayment(paymentId)
  if (!payment) return ctx.answerCallbackQuery({ text: 'Оплата не найдена', show_alert: true })
  await ctx.editMessageReplyMarkup({ reply_markup: await fullAdminPaymentKeyboard(payment) })
  await ctx.answerCallbackQuery()
}

export async function handlePaymentRetry(ctx: MyContext, paymentId: string) {
  const result = await returnPaymentToPending(paymentId, ctx.from!.id)
  if (!result.applied) return ctx.answerCallbackQuery({ text: `Статус: ${result.payment.status}`, show_alert: true })
  await ctx.editMessageReplyMarkup({ reply_markup: await fullAdminPaymentKeyboard(result.payment) })
  if (result.payment.renewalCampaignId) {
    await syncRenewalSummary(ctx.api, result.payment.renewalCampaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  await ctx.answerCallbackQuery({ text: 'Возвращено на проверку' })
}

function captionValue(caption: string, label: string): string | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return caption
    .match(new RegExp(`${escapedLabel}:\\*?\\s*([^\\n]+)`, 'i'))?.[1]
    ?.replaceAll('*', '')
    .replaceAll('`', '')
    .trim()
}

// ===== Навигация по способам оплаты =====

export async function handlePayProduct(
  ctx: MyContext,
  userId: number,
  productId: string,
  teamId: string
) {
  const team = await getTeamById(teamId)
  if (!team || team.ownerId !== userId) {
    await ctx.answerCallbackQuery({
      text: 'Оплатить может только владелец команды',
      show_alert: true,
    })
    return
  }
  if (productId === 'add_member' && !hasActiveTeamSubscription(team)) {
    await ctx.answerCallbackQuery({
      text: 'Сначала приобретите подписку для команды',
      show_alert: true,
    })
    return
  }
  if (productId === 'propresenter') {
    const devices = await ProPresenterDeviceModel.find({ teamId, status: 'active' })
    const campaigns = (await Promise.all([...new Set(devices.map((device) => device.flowNumber))]
      .map((flowNumber) => getPayableRenewalForFlow(flowNumber)))).filter((campaign) => campaign?.billingMode === 'device')
    if (!campaigns.length) {
      await ctx.answerCallbackQuery({ text: 'Сбор продления этого потока ещё не запущен администратором', show_alert: true })
      return
    }
    if (campaigns.length > 1) {
      const kb = new InlineKeyboard()
      for (const campaign of campaigns) kb.text(`Поток №${campaign!.flowNumber}`, `pr:e:${campaign!.id}:${teamId}`).row()
      await ctx.reply('Выберите поток для продления устройств:', { reply_markup: kb })
      await ctx.answerCallbackQuery()
      return
    }
    await sendDeviceChoices(ctx.api, userId, campaigns[0]!.id, teamId)
    await ctx.answerCallbackQuery()
    return
  }
  if (await isTeamProductPurchaseLocked(teamId, productId)) {
    await ctx.answerCallbackQuery({
      text: '✅ Этот продукт уже оплачен',
      show_alert: true,
    })
    return
  }
  ctx.session.payment = {
    paymentId: new Types.ObjectId().toString(),
    product: productId,
    teamId,
    method: null,
  }
  const currentSubscription = team.subscriptions.get(productId)
  const operation =
    currentSubscription?.expiresAt && ['active', 'expired'].includes(currentSubscription.status)
      ? 'Продление'
      : 'Новая подписка'
  await auditLogService.createLog({
    type: 'payment.checkout_started',
    actorType: 'user',
    actorTelegramId: userId,
    targetUserId: userId,
    targetTeamId: teamId,
    metadata: {
      orderId: ctx.session.payment.paymentId,
      teamName: team.name,
      productId,
      productName: getProduct(productId)?.name || productId,
      operation,
    },
  })
  goTo(userId, 'payment')
  await renderScreen(ctx, userId, 'payment')
}

export async function handlePayMethod(ctx: MyContext, userId: number, method: string) {
  ctx.session.payment = { ...ctx.session.payment, method }

  if (method === 'rub') {
    goTo(userId, 'rub_methods')
    await renderScreen(ctx, userId, 'rub_methods', null, ctx)
  } else if (method === 'crypto') {
    goTo(userId, 'crypto_payment')
    await renderScreen(ctx, userId, 'crypto_payment')
  }
}

export async function handleRubType(ctx: MyContext, userId: number, m: string) {
  ctx.session.payment = { ...ctx.session.payment, method: 'rub', rubType: m as any }

  if (m === 'card') {
    goTo(userId, 'rub_card_methods')
    await renderScreen(ctx, userId, 'rub_card_methods')
  } else {
    goTo(userId, 'rub_sbp_methods')
    await renderScreen(ctx, userId, 'rub_sbp_methods')
  }
}

export async function handleRubCardType(ctx: MyContext, userId: number, m: string) {
  ctx.session.payment = { ...ctx.session.payment, rubCardType: m as any }

  if (m === 'mastercard') {
    goTo(userId, 'rub_payment')
    await renderScreen(ctx, userId, 'rub_payment', ctx.session.payment)
  } else {
    goTo(userId, 'rub_sbp_methods')
    await renderScreen(ctx, userId, 'rub_sbp_methods')
  }
}

export async function handleRubBank(ctx: MyContext, userId: number, m: string) {
  ctx.session.payment = { ...ctx.session.payment, rubBank: m as any }
  goTo(userId, 'rub_payment')
  await renderScreen(ctx, userId, 'rub_payment', ctx.session.payment)
}

export async function handleCryptoNetwork(ctx: MyContext, userId: number, m: string) {
  ctx.session.payment = { ...ctx.session.payment, network: m }
  goTo(userId, 'crypto_method')
  await renderScreen(ctx, userId, 'crypto_method')
}

export async function handleCryptoSelected(ctx: MyContext, userId: number, m: string) {
  ctx.session.payment = { ...ctx.session.payment, network: m }
  goTo(userId, 'crypto_payment')
  await renderScreen(ctx, userId, 'crypto_payment', {
    network: m,
    product: ctx.session.payment?.product,
    teamId: ctx.session.payment?.teamId,
  })
}

export async function handlePaid(ctx: MyContext) {
  await ctx.editMessageCaption({
    caption:
      '📸 Отлично! Теперь пришли фото чека (или документ) в этот чат.\nЯ сразу передам админу.',
    reply_markup: new InlineKeyboard().text('Отмена', packCb({ a: 'back' })),
    parse_mode: 'Markdown',
  })
  ctx.session.waitingForReceipt = true
}

// ===== Отправка чека админу =====

export async function handleReceiptUpload(ctx: MyContext) {
  ctx.session.waitingForReceipt = false

  try {
    const userId = ctx.from!.id
    const profile = await getOrCreateUser(userId)
    const username = ctx.from!.username ? `@${ctx.from!.username}` : `ID:${userId}`
    const payment = ctx.session.payment
    const teamId = payment?.teamId
    const validTeamId = teamId && teamId !== 'undefined' ? teamId : null
    const team = validTeamId ? await getTeamById(validTeamId) : null
    if (payment?.renewalCampaignId) {
      const campaign = await getRenewalCampaign(payment.renewalCampaignId)
      const seats = await eligibleSeats(payment.renewalCampaignId, userId)
      if (!campaign || !renewalAcceptsNewPayments(campaign) || !seats.some((seat) => seat.teamId === validTeamId)) {
        throw new Error('Сбор продления закрыт или вы больше не владелец этой подписки')
      }
      const seat = await getRenewalSeat(payment.renewalCampaignId, validTeamId!)
      if (!seat) throw new Error('Устройства команды не найдены в сборе')
      if (seat?.paymentStatus !== 'none') throw new Error('Оплата этой команды уже отправлена или подтверждена')
      if (campaign.billingMode === 'device') {
        const selected = new Set(payment.renewalDeviceIds || [])
        if (!selected.size || seat.devices.filter((device) => device.active !== false && selected.has(device.deviceId || '') && device.vote === 'yes' && device.paymentStatus === 'none').length !== selected.size) {
          throw new Error('Состав устройств изменился. Вернитесь к оплате и начните заново')
        }
      }
    }

    const operationFor = (productId?: string) => {
      if (!productId || !team) return '🆕 Новая оплата'
      const subscription = team.subscriptions.get(productId)
      return subscription?.expiresAt && ['active', 'expired'].includes(subscription.status)
        ? '🔄 Продление'
        : '🆕 Новая подписка'
    }

    let methodText = ''
    if (payment?.method === 'crypto' || payment?.network) {
      const net = payment?.network || 'TRC20'
      methodText = `Крипта (${net.toUpperCase()})`
    } else {
      const bankMap: any = { tbank: 'Т-Банк', ozon: 'Озон-Банк', alfa: 'Альфа-Банк' }
      const bank = bankMap[payment?.rubBank as any] || 'Не указан'
      if (payment?.rubType === 'sbp') methodText = `Рубли — СБП (${bank})`
      if (payment?.rubType === 'card') {
        methodText =
          payment.rubCardType === 'mastercard'
            ? `Рубли — Карта (MasterCard)`
            : `Рубли — Карта МИР (${bank})`
      }
    }

    const usernameText = ctx.from!.username
      ? '@' + escapeUnderscore(ctx.from!.username)
      : 'не указано'

    let kb = new InlineKeyboard()
    let productsText = ''
    let operationText = '🆕 Новая оплата'
    const receipt = ctx.message?.photo
      ? { type: 'photo' as const, telegramFileId: ctx.message.photo.at(-1)!.file_id }
      : ctx.message?.document
        ? { type: 'document' as const, telegramFileId: ctx.message.document.file_id, fileName: ctx.message.document.file_name, mimeType: ctx.message.document.mime_type }
        : null
    if (!receipt) throw new Error('Чек должен быть фотографией или документом')
    const currency = payment?.method === 'crypto' || payment?.network ? 'usd' as const : 'rub' as const
    const createdPayments: any[] = []

    if (payment?.product === 'cart' && teamId) {
      const cart = await markCartInReview(teamId)
      const items = cart.items.filter((i: any) => i.status === 'in_review')
      const operations = items.map((i: any) => operationFor(i.product))

      productsText = items.map((i: any) => i.product).join(',')
      operationText = new Set(operations).size === 1 ? operations[0] : '📦 Смешанный заказ'

      for (const item of items) {
        const persistentPayment = await createPayment({
          userId, teamId, productId: item.product, cartItemId: item._id.toString(), currency,
          paymentMethod: methodText, operation: operationFor(item.product).includes('Продление') ? 'renewal' : 'purchase', receipt,
        })
        createdPayments.push(persistentPayment)
        await auditLogService.createLog({
          type: 'payment.created', actorType: 'user', actorTelegramId: userId,
          targetUserId: userId, targetTeamId: teamId, targetPaymentId: persistentPayment.id,
          metadata: { orderId: item._id.toString(), productId: item.product,
            operation: operationFor(item.product) },
        })
        kb.text(
          `✅ ${getProduct(item.product)?.name}`,
          packCb({ a: 'cart_accept', p: persistentPayment.id })
        )
          .text(`❌`, packCb({ a: 'cart_reject', p: persistentPayment.id }))
          .row()
      }
      const messagePaymentId = createdPayments[0]?.id
      if (messagePaymentId) {
        appendConversationContactButtons(kb, 'payment', messagePaymentId, userId)
      } else {
        kb.url('👤 Открыть Telegram-профиль', `tg://user?id=${userId}`)
      }
    } else {
      let paymentId = payment?.paymentId || new Types.ObjectId().toString()
      if (validTeamId && getProduct(payment?.product || '')) {
        const persistentPayment = await createPayment({
          id: paymentId, userId, teamId: validTeamId, productId: payment?.product || '', currency,
          paymentMethod: methodText, operation: payment?.renewalCampaignId || operationFor(payment?.product).includes('Продление') ? 'renewal' : 'purchase', receipt,
          renewalCampaignId: payment?.renewalCampaignId,
          renewalDeviceIds: payment?.renewalDeviceIds,
        })
        createdPayments.push(persistentPayment)
        paymentId = persistentPayment.id
        if (payment) payment.paymentId = paymentId
      }
      operationText = payment?.renewalCampaignId
        ? `🔄 Продление ProPresenter · поток №${(await getRenewalCampaign(payment.renewalCampaignId))?.flowNumber} · ${payment.renewalDeviceIds?.length || 0} устройств`
        : operationFor(payment?.product)
      productsText = payment?.product || ''
      kb.text('✅ Подтвердить', packCb({ a: 'accept', p: teamId }))
        .text('❌ Отклонить', packCb({ a: 'reject', p: paymentId }))
        .row()
      appendConversationContactButtons(kb, 'payment', paymentId, userId)
    }

    const teamName = team?.name || (validTeamId ? 'Неизвестно' : '—')

    let adminText = paymentCard({
      operation: operationText.replace(/^[^А-Яа-яA-Za-z]+/, '').trim(),
      productIds: payment?.product === 'cart' ? productsText.split(',').filter(Boolean) : [productsText],
      owner: profile.fio || 'не указано', username: ctx.from!.username ? '@' + ctx.from!.username : 'не указано',
      userId, team: teamName, teamId: teamId || '—', method: methodText,
      time: new Date().toLocaleString('ru-RU'),
    })
    if (payment?.renewalCampaignId && createdPayments[0]) {
      const devices = await ProPresenterDeviceModel.find({ _id: { $in: payment.renewalDeviceIds || [] } })
      const names = devices.slice(0, 8).map((device) => device.name.slice(0, 35)).join(', ')
      adminText = adminText.plain(`\n\n🖥 Устройства (${devices.length}): ${names}${devices.length > 8 ? ` и ещё ${devices.length - 8}` : ''}\nК оплате: ${createdPayments[0].amount} ${createdPayments[0].currency === 'rub' ? '₽' : 'USDT'}`)
    }

    let threadId: number | undefined
    try {
      const topic = await ctx.api.createForumTopic(
        ADMIN_GROUP_ID,
        `${operationText.replace(/[^А-Яа-яA-Za-z ]/g, '').trim()} — ${username}`
      )
      threadId = topic.message_thread_id
    } catch (err) {
      console.error('Ошибка создания темы:', err)
    }

    let sentMessage: { message_id: number } | null = null
    if (ctx.message?.photo) {
      const photo = ctx.message.photo.at(-1)!
      sentMessage = await ctx.api.sendPhoto(ADMIN_GROUP_ID, photo.file_id, {
        caption: adminText.text,
        caption_entities: adminText.entities,
        message_thread_id: threadId,
        reply_markup: kb,
      })
    } else if (ctx.message?.document) {
      sentMessage = await ctx.api.sendDocument(ADMIN_GROUP_ID, ctx.message.document.file_id, {
        caption: adminText.text,
        caption_entities: adminText.entities,
        message_thread_id: threadId,
        reply_markup: kb,
      })
    }

    if (!sentMessage) throw new Error('Чек должен быть фотографией или документом')
    for (const persistentPayment of createdPayments) {
      await attachPaymentTelegramLocation(persistentPayment.id, { threadId, messageId: sentMessage.message_id })
    }
    if (payment?.renewalCampaignId && createdPayments[0]) {
      await setRenewalPaymentStatus(payment.renewalCampaignId, validTeamId!, createdPayments[0].id, 'pending', payment.renewalDeviceIds)
      await syncRenewalSummary(ctx.api, payment.renewalCampaignId).catch((error) => console.error('Renewal summary update failed:', error))
    }

    if (payment?.product === 'cart' && teamId) {
      const cart = await getOrCreateCart(teamId)
      for (const item of cart.items.filter((candidate: any) => candidate.status === 'in_review')) {
        await auditLogService.createLog({
          type: 'payment.receipt_submitted',
          actorType: 'user',
          actorTelegramId: userId,
          targetUserId: userId,
          targetTeamId: teamId,
          targetPaymentId: createdPayments.find((created) => String(created.cartItemId) === item._id.toString())?.id,
          metadata: {
            orderId: item._id.toString(),
            teamName: team?.name,
            productId: item.product,
            productName: getProduct(item.product)?.name || item.product,
            method: methodText,
            operation: operationFor(item.product),
          },
        })
      }
    } else {
      const paymentId = payment?.paymentId || new Types.ObjectId().toString()
      if (createdPayments.length) {
        await auditLogService.createLog({
          type: 'payment.created',
          actorType: 'user',
          actorTelegramId: userId,
          targetUserId: userId,
          targetTeamId: validTeamId,
          targetPaymentId: paymentId,
          metadata: {
            teamName: team?.name,
            productId: payment?.product,
            productName: getProduct(payment?.product || '')?.name || payment?.product,
            operation: operationText,
          },
        })
      }
      await auditLogService.createLog({
        type: 'payment.receipt_submitted',
        actorType: 'user',
        actorTelegramId: userId,
        targetUserId: userId,
        targetTeamId: validTeamId,
        targetPaymentId: paymentId,
        metadata: {
          teamName: team?.name,
          productId: payment?.product,
          productName: getProduct(payment?.product || '')?.name || payment?.product,
          method: methodText,
          operation: operationText,
        },
      })
    }

    // Реакция — только визуальное подтверждение и не должна ломать оплату,
    // если Telegram не разрешил реакции в конкретном чате.
    await ctx.react('👌').catch(() => {})

    await ctx.reply(
      '✅ Чек успешно отправлен администратору! Ожидайте подтверждения. \nЧтобы вернуться в меню команд - нажмите /team_list'
    )
  } catch (err) {
    console.error('🔥 ОБЩАЯ ОШИБКА в блоке отправки чека:', err)
    await ctx.react('👎').catch(() => {})
    await ctx.reply(`❌ ${err instanceof Error ? err.message : 'Произошла ошибка при обработке чека. Попробуйте ещё раз.'}`)
  }
}

// ===== Приём/отклонение quick-buy админом =====

export async function handleAdminAccept(
  ctx: MyContext,
  teamId: string,
  caption: string,
  messageId: number
) {
  try {
    if (!teamId) {
      await ctx.answerCallbackQuery({ text: 'Team ID не найден' })
      return
    }

    const team = await getTeamById(teamId)
    if (!team) {
      await ctx.answerCallbackQuery({ text: 'Команда не найдена' })
      return
    }

    const persistentPayment = await getPaymentsForAdminMessage(messageId)
    const productId = persistentPayment[0]?.productId || caption.match(/PRODUCT_ID:(\S+)/)?.[1]
    if (!productId) {
      await ctx.answerCallbackQuery({ text: 'Товар не найден в чеке' })
      return
    }

    const persistentPaymentId = persistentPayment[0]?.id || caption.match(/PAYMENT_ID:(\S+)/)?.[1]
    if (persistentPaymentId) {
      try {
        const decision = await acceptPayment(persistentPaymentId, ctx.from!.id)
        if (!decision.applied) {
          await ctx.answerCallbackQuery({ text: decision.payment.status === 'accepted' ? 'Уже принято' : `Статус: ${decision.payment.status}`, show_alert: true })
          return
        }
        await deliverAcceptedPayment(ctx.api, decision, ctx.me.username).catch((error) => {
          if (!decision.payment.renewalCampaignId) throw error
          console.error('Renewal payment accepted, owner notification failed:', error)
        })
        await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), messageId, { caption: `${caption}\n\n✅ Принято`, caption_entities: ctx.callbackQuery?.message && 'caption_entities' in ctx.callbackQuery.message ? ctx.callbackQuery.message.caption_entities : undefined, reply_markup: await fullAdminPaymentKeyboard(decision.payment) })
        if (decision.payment.renewalCampaignId) {
          await syncRenewalSummary(ctx.api, decision.payment.renewalCampaignId).catch((error) => console.error('Renewal summary update failed:', error))
        }
        await ctx.answerCallbackQuery({ text: 'Принято ✓' })
        return
      } catch (error) {
        if (!(error instanceof PaymentNotFoundError)) throw error
      }
    }

    if (productId === 'add_member') {
      const invite = await createTeamInvite(teamId, team.ownerId)
      const inviteLink = `https://t.me/${ctx.me.username}?start=join_${invite.code}`

      await auditLogService.createLog({
        type: 'payment.approved',
        actorType: 'admin',
        actorTelegramId: ctx.from?.id,
        targetUserId: team.ownerId,
        targetTeamId: teamId,
        targetPaymentId: caption.match(/PAYMENT_ID:(\S+)/)?.[1],
        metadata: {
          teamName: team.name,
          productId,
          productName: getProduct(productId)?.name,
          method: captionValue(caption, 'Способ оплаты'),
          operation: captionValue(caption, 'Тип операции'),
        },
      })

      await ctx.api.sendMessage(
        team.ownerId,
        `✅ Оплата подтверждена!\n\n` +
          `Вот персональная ссылка-приглашение для нового участника:\n${inviteLink}\n\n` +
          `⚠️ Ссылка одноразовая: после вступления участника она станет недействительной. Отправьте её человеку, которого хотите добавить в команду «${team.name}».\n\nЧтобы вернуться в меню команд, нажмите /team_list`
      )

      const safeCaption = escapeUnderscore(`${caption}\n\n✅ Принято! Ссылка сгенерирована.`)
      await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), messageId, {
        caption: safeCaption,
      })

      await ctx.answerCallbackQuery({ text: 'Принято ✓' })
      return
    }

    if (productId === 'propresenter') {
      throw new Error('Платёж ProPresenter не найден в базе. Подтверждение без записи сбора запрещено.')
    }

    const product = getProduct(productId)
    const { isExtension } = await activateTeamSubscription(teamId, productId, 1, {
      actorType: 'admin',
      actorTelegramId: ctx.from?.id,
    })

    await auditLogService.createLog({
      type: 'payment.approved',
      actorType: 'admin',
      actorTelegramId: ctx.from?.id,
      targetUserId: team.ownerId,
      targetTeamId: teamId,
      targetPaymentId: caption.match(/PAYMENT_ID:(\S+)/)?.[1],
      targetSubscriptionId: `${teamId}:${productId}`,
      metadata: {
        teamName: team.name,
        productId,
        productName: product?.name || productId,
        method: captionValue(caption, 'Способ оплаты'),
        operation: captionValue(caption, 'Тип операции'),
      },
    })

    if (product?.groupId) {
      const invite = await createProtectedChatInvite(ctx.api, productId, team.ownerId)
      if (!invite) throw new Error('Active team access required for chat invitation')
      await ctx.api.sendMessage(
        team.ownerId,
        `✅ ${isExtension ? 'Продлено' : 'Подписка активирована:'} ${product.name}\n\nСсылка для заявки в чат действует 1 час. Бот проверит ваш Telegram ID 👇\n\n${invite.invite_link}\n\nНовую ссылку можно получить в карточке команды.`
      )
      await recordOperationalEvent({
        type: 'access.invite_issued', actorType: 'system', targetUserId: team.ownerId,
        targetTeamId: teamId, targetSubscriptionId: `${teamId}:${productId}`,
        metadata: { groupId: product.groupId, productId,
          result: 'Telegram API принял ссылку; вступление неизвестно',
          reason: isExtension ? 'восстановление или продление доступа' : 'активация подписки' },
      })
    } else {
      await ctx.api.sendMessage(
        team.ownerId,
        `✅ Подписка активирована: ${product?.name || productId} \n Ваша ссылка ниже 👇\n
        чтобы вернуться, нажмите /team_list`
      )
    }

    const safeCaption = escapeUnderscore(`${caption}\n\n✅ Принято!`)
    await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), messageId, {
      caption: safeCaption,
    })

    await ctx.answerCallbackQuery({ text: 'Принято ✓' })
  } catch (err: any) {
    console.error('Ошибка accept:', err)
    await ctx.answerCallbackQuery({ text: 'Ошибка' })
  }
}

export async function handleAdminReject(ctx: MyContext, caption: string, messageId: number, paymentIdFromCallback?: string) {
  try {
    const persistentPaymentId = paymentIdFromCallback || caption.match(/PAYMENT_ID:(\S+)/)?.[1]
    if (persistentPaymentId) {
      await showPaymentRejectReasons(ctx, persistentPaymentId)
      return
    }
    await ctx.answerCallbackQuery({
      text: 'Платёж не найден. Отклонение без сохранённой причины невозможно.',
      show_alert: true,
    })
  } catch (err: any) {
    console.error('Ошибка reject:', err)
    await ctx.answerCallbackQuery({ text: 'Ошибка' })
  }
}
