import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getActiveStreams } from '../services/proPresenterStream.service.js'

export async function propresenterStreamsScreen(
  userId: number,
  teamId: string
): Promise<ScreenView> {
  const streams = await getActiveStreams()

  const kb = new InlineKeyboard()

  streams.forEach((stream, index) => {
    kb.text(
      `${stream.flowNumber}`,
      packCb({ a: 'prop_select_stream', p: `${stream.flowNumber}:${teamId}` })
    )

    // после каждой 3-й кнопки — перенос строки
    if ((index + 1) % 3 === 0) {
      kb.row()
    }
  })

  // если последний ряд неполный (не кратен 3) — всё равно нужен row() перед кнопкой "Назад"
  if (streams.length % 3 !== 0) {
    kb.row()
  }

  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption: '*Выберите номер вашего потока:*',
    keyboard: kb,
  }
}
