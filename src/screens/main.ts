import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
    .text('Мои подписки', packCb({ a: 'open', s: 'profile' }))
    .icon('5258513401784573443')
    .row()
    .text('Добавить подписку', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5397916757333654639')
    .row()
    .url('Чат Хаб комьюнити', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5465300082628763143')
    .row()
    .text('🆘 Помощь', packCb({ a: 'open', s: 'support' }))

  return {
    photo: './public/main.png',
    caption: '*ГЛАВНОЕ МЕНЮ*\n\nВыбери раздел:',
    keyboard,
  }
}
