import { PROP_FLOWS } from '../data/ProPresenterFLows.js'
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getOrCreateUser } from '../services/user.service.js'
import { UserModel } from '../models/User.js'
import { escapeUnderscore } from '../utils/escape.js'

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

export async function profileScreen(userId: number): Promise<ScreenView> {
  const user = await getOrCreateUser(userId)
  const isVolunteer = !!user.volunteer?.ownerId

  const kb = new InlineKeyboard()
  const lines: string[] = ['', '']

  const content = user.subscriptions?.content

  const volunteers = user.subscriptions?.volunteers || []
  const maxVolunteers = 5

  // 👇 подтягиваем владельца ТОЛЬКО если нужно
  let owner: any = null
  if (isVolunteer && user.volunteer?.ownerId) {
    owner = await UserModel.findOne({
      telegramId: user.volunteer.ownerId,
    })
  }

  // 👇 ВАЖНО: отдельно выбираем prop
  const prop = isVolunteer ? owner?.subscriptions?.propresenter : user.subscriptions?.propresenter

  // 🟧 ProPresenter
  if (prop?.status === 'active') {
    const stream = prop.flow || '#'
    const flowData = PROP_FLOWS.find((f) => f.flow === Number(prop.flow))
    const days = getDaysLeft(flowData?.expiresAt)

    if (flowData?.chatFlow) {
      kb.url(`💬 Чат потока №${prop.flow}`, flowData.chatFlow).row()
    }

    lines.push(
      `*ProPresenter*`,
      `Поток: №${stream}`,
      `Логин: ${prop.email || '-'}`,
      `Пароль: \`${prop.password || '-'}\``,
      `Дата окончания: ${
        flowData?.expiresAt ? new Date(flowData.expiresAt).toLocaleDateString('ru-RU') : '-'
      }`,
      `Осталось дней: ${days}`,
      ''
    )

    if (isVolunteer) {
      // lines.push(`Роль: Волонтёр`)
      // lines.push(`Доступ выдан владельцем`, '')
    }
  } else if (prop?.status === 'pending') {
    lines.push(`*ProPresenter*`, `⏳ На проверке (поток №${prop.flow})`, '')
  }

  if (content?.status === 'pending') {
    lines.push(
      `*Контент для экранов*`,
      `⏳ На проверке, дата: ${
        content.expiresAt ? new Date(content.expiresAt).toLocaleDateString('ru-RU') : '-'
      }`,
      ''
    )
  }

  if (content?.status === 'active') {
    const days = getDaysLeft(content.expiresAt)

    if (!isVolunteer && days <= 30) {
      kb.text('💳 ПРОДЛИТЬ PRO CONTENT', packCb({ a: 'pay_product', p: 'content_screens' })).row()
    }

    kb.url('ЧАТ КОНТЕНТ ДЛЯ ЭКРАНОВ', 'https://t.me/+Pv-uHdH-X7JiMjky')
      .icon('5373330964372004748')
      .row()

    lines.push(
      `*Контент для экранов*`,
      `Дата окончания: ${content.expiresAt?.toLocaleDateString('ru-RU')}`,
      `Осталось дней: ${days}`
    )

    // 👇 ВОЛОНТЁР
    if (isVolunteer) {
      lines.push(`
*Роль: Волонтёр*`)

      lines.push(`
*Владелец*:
• ${owner?.fio || 'Не найден'}
• Username: ${owner?.username ? '@' + escapeUnderscore(owner.username) : '-'}
• ID: ${user.volunteer?.ownerId || '-'}`)

      lines.push('')
    }

    // 👇 ВЛАДЕЛЕЦ
    if (!isVolunteer) {
      const count = volunteers.length

      lines.push(`Волонтёры: ${count}/${maxVolunteers}`, '')

      if (volunteers.length > 0) {
        lines.push('*Твои волонтёры:*')

        for (const v of volunteers) {
          const fullVolunteer = await UserModel.findOne({
            telegramId: v.telegramId,
          })

          lines.push(
            `• ${fullVolunteer?.fio || 'Без имени'}
• Username: ${fullVolunteer?.username ? '@' + escapeUnderscore(fullVolunteer.username) : '-'}
• ID: ${v.telegramId}`
          )
        }

        lines.push('')
      }

      if (count < maxVolunteers) {
        kb.text('ДОБАВИТЬ ВОЛОНТЕРА', packCb({ a: 'open', s: 'add_volunteer' }))
          .icon('5258362837411045098')
          .row()
      }
    }
  }

  // ❌ нет подписок
  if (prop?.status !== 'active' && content?.status !== 'active') {
    lines.push('У вас пока нет активных подписок.', '', 'Вы можете приобрести новую подписку.')

    kb.text('ПРИОБРЕСТИ ПОДПИСКУ', packCb({ a: 'open', s: 'add_subscription' }))
      .icon('5397916757333654639')
      .row()
  }

  kb.text('◀️ НАЗАД', packCb({ a: 'open', s: 'main' }))
    .text('ПОМОЩЬ', packCb({ a: 'open', s: 'support' }))
    .icon('5238025132177369293')

  return {
    photo: './public/profile.png',
    caption: lines.join('\n'),
    keyboard: kb,
  }
}
