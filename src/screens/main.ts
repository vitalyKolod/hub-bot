import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
    .text('МОИ ПОДПИСКИ', packCb({ a: 'open', s: 'my_subscriptions' }))
    .row()
    .text('ДОБАВИТЬ ПОДПИСКУ', packCb({ a: 'open', s: 'add_subscription' }))
    .row()
    .text('КАТАЛОГ ПОДПИСОК', packCb({ a: 'open', s: 'catalog' }))
    .row()
    .text('ПОМОЩЬ', packCb({ a: 'open', s: 'help' }))
    .row()
    .text('ДРУГОЕ', packCb({ a: 'open', s: 'other' }))

  return {
    photo: './public/main.png',
    caption: '*ГЛАВНОЕ МЕНЮ*\n\nВыбери раздел:',
    keyboard,
  }
}
