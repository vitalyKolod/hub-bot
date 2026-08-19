import { FormattedString, emoji } from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'

import { getTeamById } from '../services/team.service.js'
import { UserModel } from '../models/User.js'
import {
  PRO_CONTENT_CHAT_LINK,
  CMG_CONTENT_CHAT_LINK,
  SUNDAY_SCREENS_CONTENT_CHAT_LINK,
  CGS_CHAT_LINK,
  STORY_LOOP_CHAT_LINK,
} from '../config/env.js'

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

  const prop = team.subscriptions?.get('propresenter')
  const content = team.subscriptions?.get('procontent')
  const sunday = team.subscriptions?.get('sunday_screens')
  const cgs = team.subscriptions?.get('cgs')
  const storyloops = team.subscriptions?.get('storyloops')
  const cmg = team.subscriptions?.get('cmg')

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

  if (isSubscriptionActive(prop) && meta?.chatLink) {
    kb.url(
      meta.flowNumber ? `Чат потока №${meta.flowNumber}` : 'Чат потока ProPresenter',
      meta.chatLink
    )
      .icon('5251272469175631339')
      .row()
  }

  if (isSubscriptionActive(content) && PRO_CONTENT_CHAT_LINK) {
    kb.url('Чат — ProContent', PRO_CONTENT_CHAT_LINK).icon('5251299351375937406').row()
  }

  if (isSubscriptionActive(sunday) && SUNDAY_SCREENS_CONTENT_CHAT_LINK) {
    kb.url('Чат — Sunday Screens', SUNDAY_SCREENS_CONTENT_CHAT_LINK)
      .icon('5291749654017381020')
      .row()
  }

  if (isSubscriptionActive(cmg) && CMG_CONTENT_CHAT_LINK) {
    kb.url('Чат — CMG', CMG_CONTENT_CHAT_LINK).icon('5310127020213043624').row()
  }

  if (isSubscriptionActive(cgs) && CGS_CHAT_LINK) {
    kb.url('Чат — CGS', CGS_CHAT_LINK).icon('5190419001703963847').row()
  }

  if (isSubscriptionActive(storyloops) && STORY_LOOP_CHAT_LINK) {
    kb.url('Чат — StoryLoops', STORY_LOOP_CHAT_LINK).icon('5190877553887323413').row()
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

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
    .text('ГЛАВНОЕ МЕНЮ', packCb({ a: 'home' }))
    .icon('5465226866321268133')
    .row()

  let message = new FormattedString('')

  message = message.bold(`👥 КОМАНДА: ${team.name}`).plain('\n━━━━━━━━━━━━━━\n')

  message = message.emoji('📦', '5370857213533379300').bold(' ПОДПИСКИ').plain('\n\n')

  message = message.emoji('🎬', '5251272469175631339').plain(' ').bold('ProPresenter').plain('\n')

  // PRO PRESENTER
  if (isSubscriptionActive(prop)) {
    message = message.plain('┗ Статус: ').bold('✅ Активна').plain('\n')

    if (meta?.flowNumber) {
      message = message.plain('┗ Поток: ').bold(`№${meta.flowNumber}`).plain('\n')
    }

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

    message = message.plain('┗ До: ').code(formatExpiryDateTime(prop!.expiresAt)).plain('\n')
  } else if (prop?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
  } else if (content?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
  } else if (cmg?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
  } else if (sunday?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
  } else if (cgs?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
  } else if (storyloops?.status === 'pending') {
    message = message.plain('┗ Статус: ').bold('⏳ На проверке').plain('\n')
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
