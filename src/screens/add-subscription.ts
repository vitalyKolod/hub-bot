// src/screens/add_subscription.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function addSubscriptionScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список с иконками (как на скрине)

  kb.text('🟧 Pro Presenter', packCb({ a: 'open', s: 'propresenter' })).row()
  kb.text('🟪 Контент для экранов', packCb({ a: 'open', s: 'contentScreens' })).row()
  kb.text('🟨 ДРУГОЕ', packCb({ a: 'open', s: 'other' })).row()
  kb.row()
  kb.text('❓ ЧАВО ПО ХАБУ (FAQ)', packCb({ a: 'open', s: 'faq_hub' })).row()
  kb.text('⚖️ Юридические аспекты и нюансы', packCb({ a: 'open', s: 'legal' })).row()
  kb.text('💳 ОБ ОПЛАТЕ', packCb({ a: 'open', s: 'payment' })).row()
  kb.row()
  kb.text('🏠 На Главную', packCb({ a: 'home' }))

  return {
    photo: './public/add-subscription.png',
    caption: '*ДОБАВИТЬ ПОДПИСКУ*\n\nВыберите подписку \nиз списка, доступных в ХАБе:',
    keyboard: kb,
  }
}
