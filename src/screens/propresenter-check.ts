import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterCheckScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Подать заявку на новый поток', packCb({ a: 'prop_no_stream', p: teamId })).row()
  kb.text('У меня уже есть поток', packCb({ a: 'prop_has_stream', p: teamId })).row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption: `ProPresenter — подключение\n\n` + `Выберите действие`,
    keyboard: kb,
  }
}
