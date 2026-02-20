import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'

export function mainScreen(userId: number): ScreenView {
  const keyboard = new InlineKeyboard()
    .text('📋 Мои подписки', packCb({ a: 'open', s: 'profile' }))
    .row()
    .text('➕ Добавить подписку', packCb({ a: 'open', s: 'add_subscription' }))
    .row()
    .text('💬 Чат Хаб комьюнити', packCb({ a: 'open', s: 'chat' }))
    .row()
    .text('❓ Помощь', packCb({ a: 'open', s: 'help' }))

  return {
    photo: './public/main.png',
    caption: '*ГЛАВНОЕ МЕНЮ*\n\nВыбери раздел:',
    keyboard,
  }
}
