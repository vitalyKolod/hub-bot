// src/screens/faq_hub.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function faqHubScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список категорий (как на скрине)
  kb.text('ProPresenter', packCb({ a: 'open', s: 'faq_propresenter' }))
    .icon('5251272469175631339')
    .row()
  kb.text('Контент для экранов', packCb({ a: 'open', s: 'faq_content_screens' }))
    .icon('5251299351375937406')
    .row()
    .url('Обучение', 'https://t.me/imacport')
    .icon('5226512880362332956')
    .row()
  kb.text('Другое', packCb({ a: 'open', s: 'other' }))
    .icon('5215209935188534658')
    .row()
  kb.text(' Об оплате', packCb({ a: 'open', s: 'payment' }))
    .icon('5282961772972615494')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/faq.png', // твой бирюзовый скрин или любой подходящий
    caption:
      `*ЧАВО ПО ХАБУ (FAQ)*\n\n` +
      `Здесь собраны самые частые вопросы по работе ХАБа, подпискам и оплате.\n\n` +
      `Выберите тему, чтобы увидеть подробные ответы:`,

    keyboard: kb,
  }
}
