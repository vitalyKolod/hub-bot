import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
    .text('МОИ ПОДПИСКИ', packCb({ a: 'open', s: 'profile' }))
    .icon('5258513401784573443')
    .row()
    .text('ДОБАВИТЬ ПОДПИСКУ', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5397916757333654639')
    .row()
    .url('ХАБ КОМЬЮНИТИ', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5465300082628763143')
    .row()
    .text('ПОМОЩЬ', packCb({ a: 'open', s: 'support' }))
    .icon('5238025132177369293')

  return {
    photo: './public/profile.png',
    caption: 'Выберите раздел:',
    keyboard,
  }
}
