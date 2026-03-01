// src/screens/add_subscription.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function addSubscriptionScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список, как на скрине

  kb.text('ProPresenter', packCb({ a: 'open', s: 'product', p: 'propresenter' })).row()
  kb.text('Контент для экранов', packCb({ a: 'open', s: 'product', p: 'screens' })).row()
  kb.text('ДРУГОЕ', packCb({ a: 'open', s: 'product', p: 'other' })).row()
  kb.text('ЧАВО ПО ХАБУ (FAQ)', packCb({ a: 'open', s: 'faq_hub' })).row()
  kb.text('Юридические аспекты и нюансы', packCb({ a: 'open', s: 'legal' })).row()
  kb.text('ОБ ОПЛАТЕ', packCb({ a: 'open', s: 'payment_info' })).row()
  kb.row()
  kb.text('На Главную', packCb({ a: 'home' }))

  return {
    photo: './public/add-subscription.png',
    caption: 'Профиль подписок*\n\nВыберите подписку из списка доступных в ХАБе:',
    keyboard: kb,
  }
}
