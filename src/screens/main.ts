import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
  const miniAppUrl = process.env.MINI_APP_URL
  if (miniAppUrl) keyboard.webApp('🚀 Открыть HUB', miniAppUrl).row()
  keyboard
    .text('МОИ КОМАНДЫ', packCb({ a: 'open', s: 'team_list' }))
    .icon('5258513401784573443')
    .row()
    .url('ХАБ КОМЬЮНИТИ', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5379559474405092361')
    .row()
    .text('ЯНДЕКС 360', packCb({ a: 'open', s: 'yandex360' }))
    .icon('5310051278464778081')
    .row()
    .text('ПОМОЩЬ', packCb({ a: 'open', s: 'support' }))
    .icon('5238025132177369293')

  return {
    photo: './public/main.png',
    caption: 'Выберите раздел:',
    keyboard,
  }
}
