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

  const kb = new InlineKeyboard()
  const lines: string[] = ['*👤 ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ*', '']

  const prop = user.subscriptions?.propresenter
  const content = user.subscriptions?.content

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

    kb.text(`Контент для экранов`, packCb({ a: 'noop' }))
      .icon('5251299351375937406')
      .row()

    lines.push(`*Контент для экранов*`, `Осталось дней: ${days}`, '')
  }

  // ❌ нет подписок
  if (prop?.status !== 'active' && content?.status !== 'active') {
    lines.push('У вас пока нет активных подписок.', '', 'Вы можете приобрести новую подписку.')

    kb.text('Приобрести подписку', packCb({ a: 'open', s: 'add_subscription' }))
      .icon('5397916757333654639')
      .row()
  }

  // общие кнопки
  kb.text('🆘 Помощь', packCb({ a: 'open', s: 'support' })).row()
  kb.text('🏠 На главную', packCb({ a: 'home' }))

  return {
    photo: './public/user-profile.png',
    caption: lines.join('\n'),
    keyboard: kb,
  }
}
