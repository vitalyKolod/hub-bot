import { PROP_FLOWS } from '../data/ProPresenterFLows.js'
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getOrCreateUser } from '../services/user.service.js'
import { UserModel } from '../models/User.js'

// считаем дни до даты
function getDaysLeft(date?: Date | string | null) {
  if (!date) return 0

  const target = new Date(date)
  if (isNaN(target.getTime())) return 0

  const now = new Date()

  // 💥 ВАЖНО: обнуляем время
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)

  const diff = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return diff > 0 ? diff : 0
}

export async function profileScreen(userId: number): Promise<ScreenView> {
  const user = await getOrCreateUser(userId)
  const isVolunteer = !!user.volunteer?.ownerId

  const kb = new InlineKeyboard()
  const lines: string[] = ['*👤 ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ*', '']

  const prop = user.subscriptions?.propresenter
  const content = user.subscriptions?.content

  const volunteers = user.subscriptions?.volunteers || []
  const volunteersCount = volunteers.length
  const maxVolunteers = 5

  // 🟧 ProPresenter
  if (prop?.status === 'active') {
    const stream = prop.flow || '#'
    const flowData = PROP_FLOWS.find((f) => f.flow === Number(prop.flow))
    const days = getDaysLeft(flowData?.expiresAt)

    kb.url(`💬 Чат потока №${prop.flow}`, flowData.chatFlow).row()

    lines.push(
      `*ProPresenter*`,
      `Поток: №${stream}`,
      `Логин: ${prop.email || '-'}`,
      `Пароль: ${prop.password || '-'}`,
      `Дата окончания: ${flowData?.expiresAt ? new Date(flowData.expiresAt).toLocaleDateString('ru-RU') : '-'}`,
      `Осталось дней: ${days}`,
      ''
    )
  } else if (prop?.status === 'pending') {
    lines.push(`*ProPresenter*`, `⏳ На проверке (поток №${prop.flow})`, '')
  }

  // 🟪 Контент
  if (content?.status === 'pending') {
    lines.push(
      `*Контент для экранов*`,
      `⏳ На проверке, дата: ${content.expiresAt ? new Date(content.expiresAt).toLocaleDateString('ru-RU') : '-'}`,
      ''
    )
  }

  if (content?.status === 'active') {
    const days = getDaysLeft(content.expiresAt)
    // 👉 если меньше или равно 30 дней — показываем кнопку продления
    if (days <= 30) {
      kb.text('💳 Продлить ProContent', packCb({ a: 'pay_product', p: 'content_screens' })).row()
    }

    kb.url('Чат котента для экранов', 'https://t.me/+Pv-uHdH-X7JiMjky')
      .icon('5373330964372004748')
      .row()
    lines.push(
      `*Контент для экранов*`,
      `Дата окончания: ${user.subscriptions.content.expiresAt?.toLocaleDateString('ru-RU')}`,
      `Осталось дней: ${days}`
    )

    if (isVolunteer) {
      lines.push(`Роль: Волонтёр`)

      let owner = null
      if (user.volunteer?.ownerId) {
        owner = await UserModel.findOne({
          telegramId: user.volunteer.ownerId,
        })
      }

      lines.push(`Владелец: ${owner?.fio || 'Не найден'}ID: ${user.volunteer?.ownerId || '-'}`)

      lines.push('')
    } else {
      const count = volunteers.length

      lines.push(`Волонтёры: ${count}/${maxVolunteers}`, '')

      if (volunteers.length > 0) {
        lines.push('*Твои волонтёры:*')

        for (const v of volunteers) {
          lines.push(`• ${v.fio || 'Без имени'} (ID: ${v.telegramId})`)
        }

        lines.push('')
      }

      if (count < maxVolunteers) {
        kb.text('Добавить волонтера', packCb({ a: 'open', s: 'add_volunteer' }))
          .icon('5258362837411045098')
          .row()
      }
    }
  }

  // ❌ нет подписок
  if (prop?.status !== 'active' && content?.status !== 'active') {
    lines.push('У вас пока нет активных подписок.', '', 'Вы можете приобрести новую подписку.')

    kb.text('Приобрести подписку', packCb({ a: 'open', s: 'add_subscription' }))
      .icon('5397916757333654639')
      .row()
  }

  // общие кнопки
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'main' }))
    .text('Помощь', packCb({ a: 'open', s: 'support' }))
    .icon('5238025132177369293')

  return {
    photo: './public/user-profile.png',
    caption: lines.join('\n'),
    keyboard: kb,
  }
}
