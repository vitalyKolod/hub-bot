import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function createTeamNameScreen(): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('◀️ Назад', packCb({ a: 'back' })).text('🏠 Главное меню', packCb({ a: 'home' }))

  return {
    photo: './public/create-team.png',
    caption: '*👥 СОЗДАНИЕ КОМАНДЫ*\n\n' + 'Введите название вашей команды.\n\n',
    keyboard: kb,
  }
}
