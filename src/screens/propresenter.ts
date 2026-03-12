// src/screens/propresenter.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function propresenterScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('❓ Чаво по продукту', packCb({ a: 'open', s: 'faq_propresenter' })).row()
  kb.text('💚 Оплатить', packCb({ a: 'open', s: 'payment', p: 'propresenter' })).row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propresenter.png', // твой оранжевый скрин
    caption:
      `*ProPresenter*\n\n` +
      `ProPresenter — профессиональная программа для управления слайдами, видео, текстом и worship-контентом в церквях.\n\n` +
      `Основные возможности:\n` +
      `• Красивые анимированные фоны и переходы\n` +
      `• Интеграция с нотами, текстами песен, видео\n` +
      `• Поддержка нескольких экранов (основной + confidence monitor)\n` +
      `• Автоматическое переключение слайдов по таймеру или вручную\n\n` +
      `Стоимость в ХАБе: *2000 руб/год* (или эквивалент в USDT по курсу).\n` +
      `Доступ через наш приватный поток — без ограничений и блокировок.\n\n` +
      `Выберите действие ниже:`,

    keyboard: kb,
  }
}
