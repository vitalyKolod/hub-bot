// src/screens/content_screens.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function contentScreensScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('❓ ЧАВО ПО ПРОДУКТУ', packCb({ a: 'open', s: 'faq_content_screens' })).row()
  kb.text('💚 ОПЛАТИТЬ', packCb({ a: 'open', s: 'payment', p: 'content_screens' })).row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/content-screens.png',
    caption:
      `*Контент для экранов*\n\n` +
      `Библиотека премиум-контента специально для церквей: фоны, motion-графика, видео-заставки, worship-визуалы, анимированные тексты песен и многое другое.\n\n` +
      `Основные возможности:\n` +
      `• Тысячи готовых шаблонов и элементов\n` +
      `• Ежемесячные обновления\n` +
      `• Полная совместимость с ProPresenter\n` +
      `• HD/4K качество, прозрачные фоны для текста\n\n` +
      `Стоимость в ХАБе: *1500 руб/год* (или эквивалент в USDT по курсу).\n` +
      `Доступ через наш поток — без региональных ограничений.\n\n` +
      `Выберите действие ниже:`,

    keyboard: kb,
  }
}
