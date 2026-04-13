import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getOrCreateUser } from '../services/user.service.js'

// считаем дни до даты
function getDaysLeft(date?: Date | null) {
  if (!date) return 0
  const now = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
    const days = getDaysLeft(prop.expiresAt)
    const stream = prop.flow || '#'

    kb.text(`МОЙ ПОТОК (№${stream})`, packCb({ a: 'noop' }))
      .icon('5453957997418004470')
      .row()

    lines.push(`*ProPresenter*`, `Поток: №${stream}`, `Осталось дней: ${days}`, '')
  }

  // 🟪 Контент
  if (content?.status === 'active') {
    const days = getDaysLeft(content.expiresAt)

    kb.url(`Контент для экранов`, 'https://t.me/+Pv-uHdH-X7JiMjky')
      .icon('5251299351375937406')
      .row()

    lines.push(`*Контент для экранов*`, `Осталось дней: ${days}`)

    // 👉 ЕСЛИ ЭТО ВОЛОНТЁР
    if (isVolunteer) {
      lines.push(`Роль: Волонтёр`)

      if (user.volunteer?.ownerId) {
        lines.push(`ID владельца: ${user.volunteer.ownerId}`)
      }

      lines.push('')
    } else {
      // 👉 ЕСЛИ ЭТО ВЛАДЕЛЕЦ
      const count = user.subscriptions?.volunteers?.length || 0

      lines.push(`Волонтёры: ${count}/5`, '')

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
