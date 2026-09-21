import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function teamAboutScreen(): ScreenView {
  const keyboard = new InlineKeyboard().text('Создать команду', packCb({ a: 'create_team' })).row().text('← Назад', packCb({ a: 'back' }))
  return {
    photo: './public/create-team.png',
    caption: '*👥 ЧТО ТАКОЕ КОМАНДА?*\n\nКоманда — это пространство вашей церкви внутри HUB.\n\nВ одной команде объединяются:\n\n• владелец команды;\n• участники / волонтёры;\n• подписки HUB;\n• доступы к продуктам.\n\nВладелец управляет подписками и участниками.\n\nОдин пользователь может быть владельцем одной команды\nи участником других команд.\n\nНапример:\nчеловек может управлять подписками своей церкви\nи одновременно быть волонтёром в другой команде.',
    keyboard,
  }
}
