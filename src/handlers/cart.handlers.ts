import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getUi, goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import {
  getTeamById,
  isTeamProductPurchaseLocked,
  activateTeamSubscription,
} from '../services/team.service.js'
import { getProduct } from '../config/products.js'
import {
  addToCart,
  getOrCreateCart,
  getPendingItems,
  findCartItemByItemId,
  removeFromCartByItemId,
  setCartItemStatus,
} from '../services/cart.service.js'
import type { MyContext } from '../types/context.js'
import { auditLogService, buildSubscriptionTargetId, recordOperationalEvent } from '../services/auditLog.service.js'
import { acceptPayment, getPayment } from '../services/payment.service.js'
import { deliverAcceptedPayment } from '../adapters/telegram/paymentDelivery.js'
import { showPaymentRejectReasons, fullAdminPaymentKeyboard } from './payment.handlers.js'

function callbackCaptionValue(ctx: MyContext, label: string): string | undefined {
  const message = ctx.callbackQuery?.message
  const caption = message && 'caption' in message ? message.caption || '' : ''
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return caption
    .match(new RegExp(`${escapedLabel}:\\*?\\s*([^\\n]+)`, 'i'))?.[1]
    ?.replaceAll('*', '')
    .replaceAll('`', '')
    .trim()
}

export async function handleAddToCart(
  ctx: MyContext,
  userId: number,
  productId: string,
  teamId: string
) {
  const team = await getTeamById(teamId)
  if (!team || team.ownerId !== userId) {
    await ctx.answerCallbackQuery({ text: 'Нет прав для этой команды' })
    return
  }

  if (await isTeamProductPurchaseLocked(teamId, productId)) {
    await ctx.answerCallbackQuery({ text: '✅ Этот продукт уже оплачен', show_alert: true })
    return
  }

  const added = await addToCart(teamId, productId)
  await ctx.answerCallbackQuery({ text: added ? '✅ Добавлено в корзину' : 'Товар уже находится в корзине' })
  if (added && getUi(userId).current === productId) {
    await renderScreen(ctx, userId, productId as any, teamId)
  }
}

export async function handleRemoveFromCart(ctx: MyContext, userId: number, itemId: string) {
  const { cart } = await findCartItemByItemId(itemId)
  const teamId = cart?.teamId

  await removeFromCartByItemId(itemId)

  goTo(userId, 'cart')
  await renderScreen(ctx, userId, 'cart', teamId)
}

export async function handleCheckoutCart(ctx: MyContext, userId: number, teamId: string) {
  const cart = await getOrCreateCart(teamId)
  const items = getPendingItems(cart)

  if (items.length === 0) {
    await ctx.answerCallbackQuery({ text: 'Корзина пуста' })
    return
  }

  const lockedNames: string[] = []
  for (const item of items) {
    if (await isTeamProductPurchaseLocked(teamId, item.product)) {
      lockedNames.push(getProduct(item.product)?.name || item.product)
    }
  }
  if (lockedNames.length) {
    await ctx.answerCallbackQuery({
      text: `Уже оплачено: ${lockedNames.join(', ')}. Удалите из корзины.`,
      show_alert: true,
    })
    return
  }

  ctx.session.payment = { product: 'cart', teamId, method: null }
  const team = await getTeamById(teamId)
  for (const item of items) {
    const currentSubscription = team?.subscriptions.get(item.product)
    await auditLogService.createLog({
      type: 'payment.checkout_started',
      actorType: 'user',
      actorTelegramId: userId,
      targetUserId: userId,
      targetTeamId: teamId,
      metadata: {
        orderId: item._id.toString(),
        teamName: team?.name,
        productId: item.product,
        productName: getProduct(item.product)?.name || item.product,
        operation:
          currentSubscription?.expiresAt &&
          ['active', 'expired'].includes(currentSubscription.status)
            ? 'Продление'
            : 'Новая подписка',
      },
    })
  }
  goTo(userId, 'payment')
  await renderScreen(ctx, userId, 'payment')
}

// ===== Обновление сообщения в админ-группе после решения по позиции корзины =====

async function updateCartAdminMessage(ctx: MyContext, itemId: string, statusLabel: string) {
  const msg = ctx.callbackQuery?.message
  if (!msg) return

  const chatId = msg.chat.id
  const messageId = msg.message_id
  const oldRows = msg.reply_markup?.inline_keyboard ?? []

  const acceptCb = packCb({ a: 'cart_accept', p: itemId })
  const rejectCb = packCb({ a: 'cart_reject', p: itemId })

  // убираем только строку с кнопками этой конкретной позиции
  const newRows = oldRows.filter(
    (row) =>
      !row.some(
        (btn: any) =>
          'callback_data' in btn &&
          (btn.callback_data === acceptCb || btn.callback_data === rejectCb)
      )
  )

  const oldCaption = 'caption' in msg ? (msg.caption ?? '') : ''

  try {
    if (newRows.length === 0) {
      // это была последняя позиция — убираем клавиатуру полностью
      await ctx.api.editMessageCaption(chatId, messageId, {
        caption: `${oldCaption}\n\n${statusLabel} Все позиции обработаны`,
        parse_mode: 'Markdown',
      })
    } else {
      await ctx.api.editMessageCaption(chatId, messageId, {
        caption: oldCaption,
        parse_mode: 'Markdown',
        reply_markup: InlineKeyboard.from(newRows),
      })
    }
  } catch (err) {
    console.error('Ошибка обновления сообщения корзины в админ-группе:', err)
  }
}

// ===== Приём/отклонение позиций корзины =====

export async function handleCartAccept(ctx: MyContext, itemId: string) {
  const persistentPayment = await getPayment(itemId)
  if (persistentPayment) {
    const decision = await acceptPayment(itemId, ctx.from!.id)
    if (!decision.applied) {
      await ctx.answerCallbackQuery({ text: decision.payment.status === 'accepted' ? 'Уже принято' : `Статус: ${decision.payment.status}`, show_alert: true })
      return
    }
    await deliverAcceptedPayment(ctx.api, decision, ctx.me.username)
    const msg = ctx.callbackQuery?.message
    if (msg) await ctx.api.editMessageReplyMarkup(msg.chat.id, msg.message_id, { reply_markup: await fullAdminPaymentKeyboard(decision.payment) })
    await ctx.answerCallbackQuery({ text: 'Принято ✓' })
    return
  }
  const { cart, item } = await findCartItemByItemId(itemId)

  if (!cart || !item) {
    await ctx.answerCallbackQuery({ text: 'Позиция не найдена' })
    return
  }

  const teamId = cart.teamId
  const team = await getTeamById(teamId)
  const product = getProduct(item.product)

  if (await isTeamProductPurchaseLocked(teamId, item.product)) {
    await setCartItemStatus(teamId, itemId, 'rejected')
    await updateCartAdminMessage(ctx, itemId, '⚠️ Уже оплачено.')
    await ctx.answerCallbackQuery({ text: 'Уже оплачено', show_alert: true })
    return
  }

  const { isExtension } = await activateTeamSubscription(teamId, item.product, 1, {
    actorType: 'admin',
    actorTelegramId: ctx.from?.id,
  })
  await setCartItemStatus(teamId, itemId, 'active')
  await auditLogService.createLog({
    type: 'payment.approved',
    actorType: 'admin',
    actorTelegramId: ctx.from?.id,
    targetUserId: team?.ownerId,
    targetTeamId: teamId,
    targetSubscriptionId: buildSubscriptionTargetId(teamId, item.product),
    targetPaymentId: itemId,
    metadata: {
      teamName: team?.name,
      productId: item.product,
      productName: product?.name || item.product,
      method: callbackCaptionValue(ctx, 'Способ оплаты'),
      operation: callbackCaptionValue(ctx, 'Тип операции'),
    },
  })

  if (product?.groupId) {
    try {
      const invite = await ctx.api.createChatInviteLink(product.groupId, {
        member_limit: 1,
      })
      await ctx.api.sendMessage(
        team!.ownerId,
        `✅ ${isExtension ? 'Продлено' : 'Оплата подтверждена'}: ${product.name}\n\nВаша ссылка ниже 👇\n\n${invite.invite_link}\n\nЧтобы вернуться в команду, нажмите /team_list`
      )
      await recordOperationalEvent({
        type: 'access.invite_issued', actorType: 'system', targetUserId: team!.ownerId,
        targetTeamId: teamId, targetSubscriptionId: buildSubscriptionTargetId(teamId, item.product),
        metadata: { groupId: product.groupId, productId: item.product,
          result: 'Telegram API принял ссылку; вступление неизвестно',
          reason: isExtension ? 'восстановление или продление доступа' : 'активация подписки' },
      })
    } catch (err) {
      console.error('Ошибка создания инвайта:', err)
      await ctx.api.sendMessage(team!.ownerId, `✅ Оплата подтверждена: ${product.name}`)
    }
  } else {
    await ctx.api.sendMessage(
      team!.ownerId,
      `✅ Оплата подтверждена: ${product?.name || item.product}`
    )
  }

  await updateCartAdminMessage(ctx, itemId, '✅')
  await ctx.answerCallbackQuery({ text: 'Принято ✓' })
}

export async function handleCartReject(ctx: MyContext, itemId: string) {
  const persistentPayment = await getPayment(itemId)
  if (persistentPayment) {
    await showPaymentRejectReasons(ctx, itemId)
    return
  }
  const { cart, item } = await findCartItemByItemId(itemId)

  if (!cart || !item) {
    await ctx.answerCallbackQuery({ text: 'Позиция не найдена' })
    return
  }

  await ctx.answerCallbackQuery({ text: 'Платёж не найден. Обновите карточку.', show_alert: true })
}
