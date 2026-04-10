// src/screens/add_subscription.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function addSubscriptionScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список с иконками (как на скрине)

  kb.text('Pro Presenter', packCb({ a: 'open', s: 'propresenter' }))

    .icon('5251272469175631339')
    .row()

  kb.text('Контент для экранов', packCb({ a: 'open', s: 'contentScreens' }))
    .icon('5251299351375937406')
    .row()

  kb.text('Sunday Screens', packCb({ a: 'open', s: 'sunday_screens' }))

    .icon('5291749654017381020')
    .row()

  kb.text('Другое', packCb({ a: 'open', s: 'other' }))
    .icon('5215209935188534658')
    .row()
  kb.row()
  kb.text('Чаво по ХАБу (FAQ)', packCb({ a: 'open', s: 'faq_hub' }))
    .icon('5368414803071081408')
    .row()
  kb.text('Юридические аспекты и нюансы', packCb({ a: 'open', s: 'legal' }))
    .icon('5461152608804689572')
    .row()
  kb.text('◀️ Назад', packCb({ a: 'home' }))
  kb.text('Об оплате', packCb({ a: 'open', s: 'about_payment' })).icon('5282961772972615494')

  return {
    photo: './public/add-subscription.png',
    caption: '*ДОБАВИТЬ ПОДПИСКУ*\n\nВыберите подписку из списка, доступных в ХАБе:',
    keyboard: kb,
  }
}
