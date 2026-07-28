// src/screens/propresenter.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function propresenterScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()
    .url('ОСТАВИТЬ ЗАЯВКУ', 'https://t.me/c/2060673111/2')
    .icon('5215209935188534658')
    .row()
    .url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot')
    .icon('5436113877181941026')
    .row()
  // kb.text('Сделать пожертвование', packCb({ a: 'pay_product', p: 'propresenter' }))
  //   .icon('5318912792428814144')
  //   .row()
  kb.row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption:
      `*ProPresenter*— профессиональная программа для управления слайдами, видео, текстом и worship-контентом в церквях.\n\n` +
      `*Основные возможности описаны на*` +
      `[ сайте разработчика](https://www.renewedvision.com/propresenter)\n\n` +
      `💰 *Сумма добровольного пожертвования через ХАБ: 40$/год*\n` +
      `или 3750₽/год (в зависимости от курса USDT на P2P)\n\n` +
      `📡 *Доступ через приватный ПОТОК:*\n\n` +
      `➕ *Выберите действие ниже:*`,

    keyboard: kb,
  }
}
