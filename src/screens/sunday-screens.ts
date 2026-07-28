// src/screens/propresenter.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function SundayScreensScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Чаво по продукту', packCb({ a: 'open', s: 'faq_sunday_screens' }))
    .icon('5436113877181941026')
    .row()
  kb.text('Оплатить', packCb({ a: 'pay_product', p: 'sunday_screens' }))
    .icon('5318912792428814144')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propresenter.png',
    caption:
      `*Sunday Screens*\n\n` +
      `Sunday Screens — профессиональная платформа с визуальными фонами, анимациями и графикой для экранов во время богослужений и презентаций в церквях.\n\n` +
      `*Основные возможности:*\n` +
      `• Красивые движущиеся фоны и анимированные слайды\n` +
      `• Готовые шаблоны для песен, проповедей и объявлений\n` +
      `• Поддержка различных экранов и программ проекции\n` +
      `• Доступ к библиотеке HD/4K контента без ограничений\n\n` +
      `Стоимость в ХАБе: *2000 руб/год* (или эквивалент в USDT по курсу).\n` +
      `Доступ через наш приватный поток — без ограничений и блокировок.\n\n` +
      `Выберите действие ниже:`,

    keyboard: kb,
  }
}
