// src/screens/faq_hub.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function faqHubScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  // Вертикальный список категорий (как на скрине)
  kb.text('🟧 ProPresenter', packCb({ a: 'open', s: 'faq_propresenter' })).row()
  kb.text('🟪 Контент для экранов', packCb({ a: 'open', s: 'faq_content_screens' })).row()
  kb.text('📚 Обучение', packCb({ a: 'open', s: 'faq_learning' })).row()
  kb.text('🟨 Другое', packCb({ a: 'open', s: 'other' })).row()
  kb.text('💳 Об оплате', packCb({ a: 'open', s: 'payment' })).row()
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
