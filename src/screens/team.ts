import { FormattedString, emoji } from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'

import { getTeamById, hasActiveTeamSubscription } from '../services/team.service.js'
import { UserModel } from '../models/User.js'
import { getLatestPaymentStatesForTeam } from '../services/payment.service.js'
import { listTeamDevices } from '../services/proPresenterDevice.service.js'
import { DEVICE_ICON } from '../services/proPresenterDevice.service.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'

function getDaysLeft(date?: Date | string | null) {
  if (!date) return 0

  const target = new Date(date)

  if (isNaN(target.getTime())) return 0

  const now = new Date()

  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)

  const diff = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return diff > 0 ? diff : 0
}

function formatExpiryDateTime(expiresAt?: Date | string | null): string {
  if (!expiresAt) return '-'

  const target = new Date(expiresAt)

  if (isNaN(target.getTime())) return '-'

  return target.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function isSubscriptionActive(subscription?: { status?: string; expiresAt?: Date | null }) {
  return (
    subscription?.status === 'active' &&
    !!subscription.expiresAt &&
    new Date(subscription.expiresAt).getTime() > Date.now()
  )
}

function shouldShowRenewal(subscription?: { status?: string; expiresAt?: Date | null }) {
  if (!subscription || !['active', 'expired'].includes(subscription.status || '')) return false
  if (!subscription.expiresAt) return true
  const remaining = new Date(subscription.expiresAt).getTime() - Date.now()
  return remaining <= 14 * 24 * 60 * 60 * 1000
}

export async function teamScreen(userId: number, params: any): Promise<ScreenView> {
  const teamId = typeof params === 'string' ? params : params?.teamId

  if (!teamId) {
    throw new Error('Team id not found')
  }

  const team = await getTeamById(teamId)

  if (!team) {
    throw new Error('Team not found')
  }

  const owner = await UserModel.findOne({
    telegramId: team.ownerId,
  })
  const recentPayments = await getLatestPaymentStatesForTeam(teamId)
  const paymentByProduct = new Map<string, any>()
  for (const payment of recentPayments) {
    if (!paymentByProduct.has(payment.productId)) paymentByProduct.set(payment.productId, payment)
  }

  const prop = team.subscriptions?.get('propresenter')
  const devices = await listTeamDevices(teamId)
  const deviceFlows = devices.length ? await ProPresenterStreamModel.find({ flowNumber: { $in: [...new Set(devices.map((device) => device.flowNumber))] } }) : []
  const content = team.subscriptions?.get('procontent')
  const sunday = team.subscriptions?.get('sunday_screens')
  const cgs = team.subscriptions?.get('cgs')
  const storyloops = team.subscriptions?.get('storyloops')
  const cmg = team.subscriptions?.get('cmg')
  const propPayment = paymentByProduct.get('propresenter')
  const contentPayment = paymentByProduct.get('procontent')
  const sundayPayment = paymentByProduct.get('sunday_screens')
  const cgsPayment = paymentByProduct.get('cgs')
  const storyloopsPayment = paymentByProduct.get('storyloops')
  const cmgPayment = paymentByProduct.get('cmg')

  const meta = prop?.meta as
    | {
        flowNumber?: number
        email?: string
        password?: string
        chatLink?: string
      }
    | undefined

  // ============================================================
  // КЛАВИАТУРА
  // ============================================================

  const kb = new InlineKeyboard()

  // --- Кнопки-ссылки на чаты: показываем ТОЛЬКО для активных подписок ---

  for (const stream of deviceFlows) {
    if (!stream.chatLink) continue
    kb.url(`Чат потока №${stream.flowNumber}`, stream.chatLink).icon('5251272469175631339').row()
  }
  if (isSubscriptionActive(prop) && meta?.chatLink && !deviceFlows.some((stream) => stream.flowNumber === meta.flowNumber && stream.chatLink)) {
    kb.url(
      meta.flowNumber ? `Чат потока №${meta.flowNumber}` : 'Чат потока ProPresenter',
      meta.chatLink
    )
      .icon('5251272469175631339')
      .row()
  }

  if (isSubscriptionActive(content)) {
    kb.text('Чат — ProContent', 'chat_access:procontent').icon('5251299351375937406').row()
  }

  if (isSubscriptionActive(sunday)) {
    kb.text('Чат — Sunday Screens', 'chat_access:sunday_screens')
      .icon('5291749654017381020')
      .row()
  }

  if (isSubscriptionActive(cmg)) {
    kb.text('Чат — CMG', 'chat_access:cmg').icon('5310127020213043624').row()
  }

  if (isSubscriptionActive(cgs)) {
    kb.text('Чат — CGS', 'chat_access:cgs').icon('5190419001703963847').row()
  }

  if (isSubscriptionActive(storyloops)) {
    kb.text('Чат — StoryLoops', 'chat_access:storyloops').icon('5190877553887323413').row()
  }

  if (devices.length || ['active', 'expired'].includes(prop?.status || '')) {
    kb.text('УСТРОЙСТВА', packCb({ a: 'open', s: 'devices', p: teamId })).icon(DEVICE_ICON).row()
  }
  if (team.ownerId === userId) {
    for (const [productId, subscription] of team.subscriptions.entries()) {
      // ProPresenter продлевается только администратором через служебное уведомление.
      if (productId === 'propresenter') continue
      if (!shouldShowRenewal(subscription)) continue
      const productName = getProduct(productId)?.name || productId
      kb.text(
        `Продлить ${productName}`,
        packCb({
          a: 'open',
          s: productId === 'propresenter' ? 'propresenter' : productId,
          p: teamId,
        })
      )
        .icon('5346321684574003384')
        .row()
    }

    kb.text(
      'ДОБАВИТЬ ПОДПИСКУ',
      packCb({
        a: 'open',
        s: 'add_subscription',
        p: teamId,
      })
    )
      .icon('5397916757333654639')
      .row()

    if (hasActiveTeamSubscription(team)) {
      kb.text(
        'ДОБАВИТЬ УЧАСТНИКА',
        packCb({
          a: 'open',
          s: 'add_volunteer',
          p: teamId,
        })
      )
        .icon('5258362837411045098')
        .row()
    }
  }

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
    .text('ГЛАВНОЕ МЕНЮ', packCb({ a: 'home' }))
    .icon('5465226866321268133')
    .row()

  let message = new FormattedString('')

  message = message.bold(`👥 КОМАНДА: ${team.name}`).plain('\n━━━━━━━━━━━━━━\n')

  message = message.emoji('📦', '5370857213533379300').bold(' ПОДПИСКИ').plain('\n\n')

  message = message.emoji('🎬', '5251272469175631339').plain(' ').bold('ProPresenter').plain('\n')

  // PRO PRESENTER
  if (devices.length) {
    const orderedFlows = [...deviceFlows].sort((a, b) => a.flowNumber - b.flowNumber)
    message = message.plain('┗ Статус: ').bold(orderedFlows.some((stream) => stream.expiresAt && new Date(stream.expiresAt).getTime() > Date.now()) ? '✅ Активна' : '❌ Срок истёк').plain('\n')
    for (const stream of orderedFlows.slice(0, 5)) {
      message = message.plain(`┗ Поток №${stream.flowNumber}, до ${formatExpiryDateTime(stream.expiresAt)}\n`)
      message = message.plain('┗ Осталось: ').bold(`${getDaysLeft(stream.expiresAt)} дн.`).plain('\n')
      message = message.plain('┗ Логин: ').code(stream.email).plain('\n')
      message = message.plain('┗ Пароль: ').spoiler(stream.password).plain('\n')
    }
    if (orderedFlows.length > 5) message = message.plain(`┗ Ещё потоков: ${orderedFlows.length - 5}\n`)
    message = message.emoji('🖥', DEVICE_ICON).plain(' Устройства:\n')
    for (const device of devices.slice(0, 8)) message = message.plain(`  ┗ ${device.name} (№${device.flowNumber})\n`)
    if (devices.length > 8) message = message.plain(`  ┗ И ещё ${devices.length - 8} — в разделе «Устройства»\n`)
    if (propPayment?.status === 'pending') message = message.plain('┗ Оплата: ').bold('⏳ На проверке').plain('\n')
  } else if (isSubscriptionActive(prop)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    if (meta?.flowNumber) message = message.plain(`┗ Поток №${meta.flowNumber}, до ${formatExpiryDateTime(prop!.expiresAt)}\n`)

    if (meta?.email) {
      message = message.plain('┗ Логин: ').code(meta.email).plain('\n')
    }

    if (meta?.password) {
      message = message.plain('┗ Пароль: ').spoiler(meta.password).plain('\n')
    }

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(prop!.expiresAt)} дн.`)
      .plain('\n')

    message = message.emoji('🖥', DEVICE_ICON).plain(' Устройства: пока не указаны\n')
    if (propPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (propPayment?.status === 'pending' || prop?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (propPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${propPayment.rejectionReason || 'не указана'}\n`)
  } else if (prop?.status === 'expired' || prop?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }

  message = message.plain('\n')

  // PROCONTENT
  message = message.emoji('🖥', '5251299351375937406').plain(' ').bold('ProContent').plain('\n')

  if (isSubscriptionActive(content)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(content!.expiresAt)} дн.`)
      .plain('\n')

    message = message.plain('┗ До: ').code(formatExpiryDateTime(content!.expiresAt)).plain('\n')
    if (contentPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (contentPayment?.status === 'pending' || content?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (contentPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${contentPayment.rejectionReason || 'не указана'}\n`)
  } else if (content?.status === 'expired' || content?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }

  message = message.plain('\n')

  // CMG

  message = message.emoji('🎬', '5310127020213043624').plain(' ').bold('CMG').plain('\n')

  if (isSubscriptionActive(cmg)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(cmg!.expiresAt)} дн.`)
      .plain('\n')

    message = message.plain('┗ До: ').code(formatExpiryDateTime(cmg!.expiresAt)).plain('\n')
    if (cmgPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (cmgPayment?.status === 'pending' || cmg?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (cmgPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${cmgPayment.rejectionReason || 'не указана'}\n`)
  } else if (cmg?.status === 'expired' || cmg?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }

  message = message.plain('\n')

  // SUNDAY SCREENS

  message = message.emoji('🎬', '5291749654017381020').plain(' ').bold('Sunday Screens').plain('\n')

  if (isSubscriptionActive(sunday)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(sunday!.expiresAt)} дн.`)
      .plain('\n')

    message = message.plain('┗ До: ').code(formatExpiryDateTime(sunday!.expiresAt)).plain('\n')
    if (sundayPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (sundayPayment?.status === 'pending' || sunday?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (sundayPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${sundayPayment.rejectionReason || 'не указана'}\n`)
  } else if (sunday?.status === 'expired' || sunday?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }

  message = message.plain('\n')

  // CGS

  message = message.emoji('🎬', '5190419001703963847').plain(' ').bold('CGS').plain('\n')

  if (isSubscriptionActive(cgs)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(cgs!.expiresAt)} дн.`)
      .plain('\n')

    message = message.plain('┗ До: ').code(formatExpiryDateTime(cgs!.expiresAt)).plain('\n')
    if (cgsPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (cgsPayment?.status === 'pending' || cgs?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (cgsPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${cgsPayment.rejectionReason || 'не указана'}\n`)
  } else if (cgs?.status === 'expired' || cgs?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }

  message = message.plain('\n')

  // STORYLOOPS

  message = message.emoji('🎬', '5190877553887323413').plain(' ').bold('StoryLoops').plain('\n')

  if (isSubscriptionActive(storyloops)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    message = message
      .plain('┗ Осталось: ')
      .bold(`${getDaysLeft(storyloops!.expiresAt)} дн.`)
      .plain('\n')

    message = message.plain('┗ До: ').code(formatExpiryDateTime(storyloops!.expiresAt)).plain('\n')
    if (storyloopsPayment?.status === 'pending')
      message = message.plain('┗ Продление: ').bold('⏳ На проверке').plain('\n')
  } else if (storyloopsPayment?.status === 'pending' || storyloops?.status === 'pending') {
    message = message
      .plain('┗ Статус: ')
      .bold('⏳ На проверке')
      .plain('\n┗ Оплата проверяется администратором\n')
  } else if (storyloopsPayment?.status === 'rejected') {
    message = message
      .plain('┗ Статус: ')
      .bold('❌ Оплата отклонена')
      .plain(`\n┗ Причина: ${storyloopsPayment.rejectionReason || 'не указана'}\n`)
  } else if (storyloops?.status === 'expired' || storyloops?.status === 'active') {
    message = message.plain('┗ Статус: ').bold('❌ Подписка закончилась').plain('\n')
  } else {
    message = message.plain('┗ Статус: ❌ Нет\n')
  }
  message = message
    .plain('━━━━━━━━━━━━━━')
    .plain('\n')

    .bold('👑 Владелец')
    .plain('\n')
    .plain(owner?.fio || 'Не найден')
    .plain('\n━━━━━━━━━━━━━━\n')

  // СОСТАВ КОМАНДЫ

  message = message
    .bold('Состав команды:')
    .plain('\n')
    .bold(`👥 Участников: ${team.members.length}/5`)
    .plain('\n━━━━━━━━━━━━━━\n')

  for (const member of team.members) {
    const memberUser = await UserModel.findOne({
      telegramId: member.telegramId,
    })

    const role = member.role === 'owner' ? '👑' : '👤'

    const youLabel = member.telegramId === userId ? ' (ВЫ)' : ''

    message = message.bold(`${role} ${memberUser?.fio || 'Без имени'}${youLabel}`).plain('\n')

    message = message
      .plain('┗ Username: ')
      .plain(memberUser?.username ? `@${memberUser.username}` : 'Не указан')
      .plain('\n')

    message = message.plain('┗ ID: ').code(String(member.telegramId)).plain('\n\n')
  }

  return {
    photo: './public/my-teams.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
