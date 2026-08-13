import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterConfirmScreen(userId: number, params: string): ScreenView {
  const [flowNumber, teamId] = params.split(':')

  const kb = new InlineKeyboard()
  kb.text(
    '✅ Да, всё верно',
    packCb({ a: 'prop_confirm_stream', p: `${flowNumber}:${teamId}` })
  ).row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption:
      `*Подтверждение потока*\n\n` +
      `Вы указали, что ваша команда состоит в *Потоке №${flowNumber}*.\n\n` +
      `Заявка будет отправлена администратору на проверку. Всё верно?`,
    keyboard: kb,
  }
}
