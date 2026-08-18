import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import { getUserTeams } from '../services/team.service.js'
import type { ScreenView } from '../core/render.js'

export async function teamListScreen(userId: number): Promise<ScreenView> {
  const teams = await getUserTeams(userId)

  const kb = new InlineKeyboard()

  if (teams.length > 0) {
    for (const team of teams) {
      kb.text(
        team.name,
        packCb({
          a: 'open',
          s: 'team',
          p: team._id.toString(),
        })
      )
        .icon('6032594876506312598')
        .row()
    }
  }

  kb.text('СОЗДАТЬ КОМАНДУ', packCb({ a: 'open', s: 'create_team_info' }))
    .icon('5397916757333654639')
    .row()

  kb.text('ЧТО ТАКОЕ КОМАНДА', packCb({ a: 'open', s: 'create_team_info' }))
    .icon('5465226866321268133')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'home' }))

  // ─────────────────────────────────────────────
  // Сообщение
  // ─────────────────────────────────────────────

  let message = new FormattedString('')

  message = message
    .bold('МОИ КОМАНДЫ')
    .plain(' ')
    .emoji('▫️', '5296533616224906961')
    .plain(' ')
    .plain('\n\n')

  if (teams.length === 0) {
    message = message
      .plain('У вас пока нет созданных команд.')
      .plain('\n\n')
      .plain('Создайте команду, чтобы начать работу.')
  } else {
    message = message
      .plain('У вас команд: ')
      .bold(String(teams.length))
      .plain('\n\n')
      .plain('Выберите нужную команду ниже.')
  }

  return {
    photo: './public/my-teams.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
