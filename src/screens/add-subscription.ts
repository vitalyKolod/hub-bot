import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { getTeamById } from '../services/team.service.js'
import type { ScreenView } from '../core/render.js'

export async function addSubscriptionScreen(userId: number, teamId: string): Promise<ScreenView> {
  const team = await getTeamById(teamId)

  // if (!team || team.ownerId !== userId) {
  //   return {
  //     photo: './public/add-subscription.png',
  //     caption: 'У вас нет прав добавлять подписки для этой команды.',
  //     keyboard: new InlineKeyboard().text('◀️ Назад', packCb({ a: 'back' })),
  //   }
  // }

  const kb = new InlineKeyboard()

  kb.text('PRO PRESENTER', packCb({ a: 'open', s: 'propresenter', p: teamId }))
    .icon('5251272469175631339')
    .row()

  kb.text('КОНТЕНТ ДЛЯ ЭКРАНОВ', packCb({ a: 'open', s: 'content_menu', p: teamId }))
    .icon('5251299351375937406')
    .row()

  kb.text('ДРУГОЕ', packCb({ a: 'open', s: 'other', p: teamId }))
    .icon('5215209935188534658')
    .row()
  kb.row()
  kb.text('ЧАВО ПО ХАБУ (FAQ)', packCb({ a: 'open', s: 'faq_hub' }))
    .icon('5368414803071081408')
    .row()
  kb.text('ЮРИДИЧЕСКИЕ АСПЕКТЫ И НЮАНСЫ', packCb({ a: 'open', s: 'legal' }))
    .icon('5461152608804689572')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
  kb.text('ОБ ОПЛАТЕ', packCb({ a: 'open', s: 'about_payment' })).icon('5282961772972615494')

  kb.text('◀️ НАЗАД', packCb({ a: 'home' }))
  kb.text('О ПОЖЕРТВОВАНИИ', packCb({ a: 'open', s: 'about_payment' })).icon('5282961772972615494')


  return {
    photo: './public/add-subscription.png',
    caption: '*Выберите подписку из списка, доступных в ХАБе:*',
    keyboard: kb,
  }
}
