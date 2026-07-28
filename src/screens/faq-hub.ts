// src/screens/faq_hub.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function faqHubScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список категорий (как на скрине)
  kb.text('PRO PRESENTER', packCb({ a: 'open', s: 'propresenter' }))
    .icon('5251272469175631339')
    .row()
  kb.text('КОНТЕНТ ДЛЯ ЭКРАНОВ', packCb({ a: 'open', s: 'contentScreens' }))
    .icon('5251299351375937406')
    .row()
    .url('ОБУЧЕНИЕ', 'https://t.me/imacport')
    .icon('5226512880362332956')
    .row()
  kb.text('ДРУГОЕ', packCb({ a: 'open', s: 'other' }))
    .icon('5215209935188534658')
    .row()
  kb.text(' О ПОЖЕРТВОВАНИИ', packCb({ a: 'open', s: 'about_payment' }))
    .icon('5282961772972615494')
    .row()
  kb.row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  return {
    photo: './public/help.jpg',
    caption:
      `*ЧАВО ПО ХАБУ (FAQ)*\n\n` +
      `Здесь собраны самые частые вопросы по работе ХАБа, подпискам и добровольным пожертвованиям.\n\n` +
      `Выберите тему, чтобы увидеть подробные ответы:`,

    keyboard: kb,
  }
}
