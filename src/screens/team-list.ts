import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getUserTeams } from '../services/team.service.js'
import type { ScreenView } from '../core/render.js'

export async function teamListScreen(userId: number): Promise<ScreenView> {
  const teams = await getUserTeams(userId)

  const kb = new InlineKeyboard()

  if (teams.length > 0) {
    for (const team of teams) {
      kb.text(
        `${team.name}`,
        packCb({
          a: 'open',
          s: 'team',
          p: team._id.toString(), // строка, не объект
        })
      )
        .icon('6032594876506312598')
        .row()
    }
  }

  kb.text('СОЗДАТЬ КОМАНДУ', packCb({ a: 'open', s: 'create_team_info' }))
    .icon('5397916757333654639')
    .row()

  kb.text('❓ ЧТО ТАКОЕ КОМАНДА', packCb({ a: 'open', s: 'create_team_info' })).row()

  kb.text('◀️ НАЗАД', packCb({ a: 'home' }))

  return {
    photo: './public/my-teams.png',
    caption:
      teams.length === 0
        ? '*👥 МОИ КОМАНДЫ*\n\nУ вас пока нет команд.'
        : `*👥 МОИ КОМАНДЫ*\n\nУ вас команд: *${teams.length}*`,
    keyboard: kb,
  }
}
