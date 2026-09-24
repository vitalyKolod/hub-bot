import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { PROFILE_ICONS } from '../ui/emoji/icons.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
  const miniAppUrl = process.env.MINI_APP_URL
  if (miniAppUrl) keyboard.webApp('🚀 Открыть HUB', miniAppUrl).row()
  keyboard
    .text('Мой профиль', packCb({ a: 'open', s: 'profile' }))
    .icon(PROFILE_ICONS.profile)
    .row()
    .text('МОИ КОМАНДЫ', packCb({ a: 'open', s: 'team_list' }))
    .icon('5258513401784573443')
    .row()
    // .text('ДОБАВИТЬ ПОДПИСКУ', packCb({ a: 'open', s: 'add_subscription' }))
    // .icon('5397916757333654639')
    // .row()
    .url('ХАБ КОМЬЮНИТИ', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5379559474405092361')
    .row()
    .text('ТУТОРИАЛЫ', packCb({ a: 'open', s: 'tutorials' }))
    .icon('5944753741512052670')
    .row()
    .text('ПОМОЩЬ', packCb({ a: 'open', s: 'support' }))
    .icon('5238025132177369293')

  return {
    photo: './public/main.png',
    caption: 'Выберите раздел:',
    keyboard,
  }
}
