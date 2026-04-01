import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProfile } from '../state/profile.js'

export function profileScreen(userId: number): ScreenView {
  const p = getProfile(userId)

  const kb = new InlineKeyboard()

  const lines: string[] = ['*👤 ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ*', '']

  // 🟧 ProPresenter (Мой поток)
  if (p.hasProPresenter) {
    const days = p.proDaysLeft ?? 0
    const stream = p.proStreamNo ?? '#'

    kb.text(`🟧 МОЙ ПОТОК (№${stream})`, packCb({ a: 'noop' })).row()

    lines.push(`🟧 *ProPresenter*`, `Поток: №${stream}`, `Осталось дней: ${days}`, '')
  }

  // 🟪 Контент для экранов
  if (p.hasScreens) {
    const days = p.screensDaysLeft ?? 0

    kb.text(`🟪 Контент для экранов`, packCb({ a: 'noop' })).row()

    lines.push(`🟪 *Контент для экранов*`, `Осталось дней: ${days}`, '')
  }

  // Если вообще нет подписок
  if (!p.hasProPresenter && !p.hasScreens) {
    lines.push('У вас пока нет активных подписок.', '', 'Вы можете приобрести новую подписку.')

    kb.text('➕ Приобрести подписку', packCb({ a: 'open', s: 'add_subscription' })).row()
  }

  // Общие кнопки
  kb.text('🆘 Помощь', packCb({ a: 'open', s: 'support' })).row()
  kb.text('🏠 На главную', packCb({ a: 'home' }))

  return {
    photo: './public/user-profile.png',
    caption: lines.join('\n'),
    keyboard: kb,
  }
}
