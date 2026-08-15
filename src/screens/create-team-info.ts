import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function createTeamInfoScreen(): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    '✅ СОЗДАТЬ КОМАНДУ',
    packCb({
      a: 'create_team',
    })
  ).row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  return {
    photo: './public/create-team.png',
    caption:
      '*👥 КАК СОЗДАТЬ КОМАНДУ*\n\n' +
      '• Нажмите кнопку «СОЗДАТЬ КОМАНДУ» ниже и введите название.\n' +
      '• После этого команда появится в разделе «Мои команды» в виде отдельной кнопки.',
    keyboard: kb,
  }
}
