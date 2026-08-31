import { InlineKeyboard } from 'grammy'
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
    product: productId,
    teamId,
    method: null,
  }
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

    if (payment?.product === 'cart' && teamId) {
      const cart = await markCartInReview(teamId)
      const items = cart.items.filter((i: any) => i.status === 'in_review')
      const operations = items.map((i: any) => operationFor(i.product))

      productsText = items
        .map(
          (i: any) => `• ${getProduct(i.product)?.name || i.product} — ${operationFor(i.product)}`
        )
        .join('\n')
      operationText = new Set(operations).size === 1 ? operations[0] : '📦 Смешанный заказ'

      for (const item of items) {
        kb.text(
          `✅ ${getProduct(item.product)?.name}`,
          packCb({ a: 'cart_accept', p: item._id.toString() })
        )
          .text(`❌`, packCb({ a: 'cart_reject', p: item._id.toString() }))
          .row()
      }
      kb.url('Написать юзеру', `tg://user?id=${userId}`)
    } else {
      operationText = operationFor(payment?.product)
      productsText = `• ${getProduct(payment?.product || '')?.name || payment?.product} — ${operationText}\n\`PRODUCT_ID:${payment?.product}\``
      kb.text('✅ Принять', packCb({ a: 'accept', p: teamId }))
        .text('❌ Отклонить', packCb({ a: 'reject', p: teamId }))
        .row()
        .url('Написать юзеру', `tg://user?id=${userId}`)
    }

    const teamName = team?.name || (validTeamId ? 'Неизвестно' : '—')

    const adminText = `
💰 *ОПЛАТА: ${operationText.toUpperCase()}*
━━━━━━━━━━━━━━
🏷 *Тип операции:* ${operationText}
📦 *Товары:*
${productsText}
━━━━━━━━━━━━━━
👤 *Владелец:* ${profile.fio || 'не указано'}
😎 *Юзернейм:* ${usernameText}
🆔 *ID:* \`${userId}\`
👥 *Команда:* ${escapeUnderscore(teamName)}
🆔 *Team ID:* \`${teamId || '—'}\`
━━━━━━━━━━━━━━
💳 *Способ оплаты:* ${methodText}
🕒 *Время:* ${new Date().toLocaleString('ru-RU')}

━━━━━━━━━━━━━━
Проверь и подтверди вручную! 👇
`.trim()

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

    if (ctx.message?.photo) {
      const photo = ctx.message.photo.at(-1)!
      await ctx.api.sendPhoto(ADMIN_GROUP_ID, photo.file_id, {
        caption: adminText,
        parse_mode: 'Markdown',
        message_thread_id: threadId,
        reply_markup: kb,
      })
    } else if (ctx.message?.document) {
      await ctx.api.sendDocument(ADMIN_GROUP_ID, ctx.message.document.file_id, {
        caption: adminText,
        parse_mode: 'Markdown',
        message_thread_id: threadId,
        reply_markup: kb,
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

    const productMatch = caption.match(/PRODUCT_ID:(\S+)/)
    const productId = productMatch?.[1]
    if (!productId) {
      await ctx.answerCallbackQuery({ text: 'Товар не найден в чеке' })
      return
    }

    if (productId === 'add_member') {
      const invite = await createTeamInvite(teamId, team.ownerId)
      const inviteLink = `https://t.me/${ctx.me.username}?start=join_${invite.code}`

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
    const { isExtension } = await activateTeamSubscription(teamId, productId)

    if (product?.groupId) {
      const invite = await ctx.api.createChatInviteLink(product.groupId, {
        member_limit: 1,
      })
      await ctx.api.sendMessage(
        team.ownerId,
        `✅ ${isExtension ? 'Продлено' : 'Подписка активирована, '}:${product.name}\n\nВаша ссылка ниже 👇\n\n${invite.invite_link}\n\nчтобы вернуться в команду, нажмите /team_list`
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

export async function handleAdminReject(ctx: MyContext, caption: string, messageId: number) {
  try {
    await ctx.api.editMessageText(String(ADMIN_GROUP_ID), messageId, `${caption}\n\n❌ Отклонено`, {
      parse_mode: 'Markdown',
    })
    await ctx.answerCallbackQuery({ text: 'Отклонено ✗' })
  } catch (err: any) {
    console.error('Ошибка reject:', err)
    await ctx.answerCallbackQuery({ text: 'Ошибка' })
  }
}
