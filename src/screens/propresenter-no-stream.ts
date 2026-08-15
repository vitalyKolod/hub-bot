import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterNoStreamScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('✅ Да, подать заявку', packCb({ a: 'prop_no_stream_confirm', p: teamId })).row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption:
      `*Заявка на новый поток*\n\n` +
      `Сейчас доступные потоки заполнены. Вы можете подать заявку на подключение к следующему потоку ProPresenter.\n\n` +
      `Как только наберётся достаточно желающих — мы откроем новый поток и сообщим вам.\n\n` +
      `Подать заявку?`,
    keyboard: kb,
  }
}
