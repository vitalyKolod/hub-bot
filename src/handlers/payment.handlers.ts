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
import { auditLogService } from '../services/auditLog.service.js'
import { acceptPayment, attachPaymentTelegramLocation, createPayment, getPayment, getPaymentsForAdminMessage, PaymentNotFoundError, rejectPayment, returnPaymentToPending } from '../services/payment.service.js'
import { deliverAcceptedPayment, deliverRejectedPayment } from '../adapters/telegram/paymentDelivery.js'
import { appendConversationContactButtons } from '../services/conversation.service.js'

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
    type: 'payment.created',
    actorType: 'user',
    actorTelegramId: userId,
    targetUserId: userId,
    targetTeamId: teamId,
    targetPaymentId: ctx.session.payment.paymentId,
    metadata: {
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
    const paymentWasAlreadyCreated = Boolean(payment?.paymentId)
    const teamId = payment?.teamId
    const validTeamId = teamId && teamId !== 'undefined' ? teamId : null
    const team = validTeamId ? await getTeamById(validTeamId) : null

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
          paymentMethod: methodText, operation: operationFor(payment?.product).includes('Продление') ? 'renewal' : 'purchase', receipt,
        })
        createdPayments.push(persistentPayment)
        paymentId = persistentPayment.id
        if (payment) payment.paymentId = paymentId
      }
      operationText = operationFor(payment?.product)
      productsText = payment?.product || ''
      kb.text('✅ Подтвердить', packCb({ a: 'accept', p: teamId }))
        .text('❌ Отклонить', packCb({ a: 'reject', p: paymentId }))
        .row()
      appendConversationContactButtons(kb, 'payment', paymentId, userId)
    }

    const teamName = team?.name || (validTeamId ? 'Неизвестно' : '—')

    const adminText = paymentCard({
      operation: operationText.replace(/^[^А-Яа-яA-Za-z]+/, '').trim(),
      productIds: payment?.product === 'cart' ? productsText.split(',').filter(Boolean) : [productsText],
      owner: profile.fio || 'не указано', username: ctx.from!.username ? '@' + ctx.from!.username : 'не указано',
      userId, team: teamName, teamId: teamId || '—', method: methodText,
      time: new Date().toLocaleString('ru-RU'),
    })

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

    if (payment?.product === 'cart' && teamId) {
      const cart = await getOrCreateCart(teamId)
      for (const item of cart.items.filter((candidate: any) => candidate.status === 'in_review')) {
        await auditLogService.createLog({
          type: 'payment.receipt_submitted',
          actorType: 'user',
          actorTelegramId: userId,
          targetUserId: userId,
          targetTeamId: teamId,
          targetPaymentId: item._id.toString(),
          metadata: {
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
      if (!paymentWasAlreadyCreated) {
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
    await ctx.reply('❌ Произошла ошибка при обработке чека. Попробуй ещё раз.')
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
        await deliverAcceptedPayment(ctx.api, decision, ctx.me.username)
        await ctx.api.editMessageCaption(String(ADMIN_GROUP_ID), messageId, { caption: `${caption}\n\n✅ Принято`, caption_entities: ctx.callbackQuery?.message && 'caption_entities' in ctx.callbackQuery.message ? ctx.callbackQuery.message.caption_entities : undefined, reply_markup: await fullAdminPaymentKeyboard(decision.payment) })
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
      const invite = await ctx.api.createChatInviteLink(product.groupId, {
        member_limit: 1,
      })
      await ctx.api.sendMessage(
        team.ownerId,
        `✅ ${isExtension ? 'Продлено' : 'Подписка активирована:'} ${product.name}\n\nВаша ссылка ниже 👇\n\n${invite.invite_link}\n\nчтобы вернуться в команду, нажмите /team_list`
      )
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
