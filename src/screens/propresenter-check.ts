import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterCheckScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('✅ Да, есть поток', packCb({ a: 'prop_has_stream', p: teamId })).row()
  kb.text('❌ Нет, нужен поток', packCb({ a: 'prop_no_stream', p: teamId })).row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption:
      `*ProPresenter — подключение*\n\n` + `У вашей команды уже есть номер потока ProPresenter?`,
    keyboard: kb,
  }
}
