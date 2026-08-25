// src/screens/support.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function supportScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()
    .text('Написать в поддержку', 'support:start')
    .icon('5307746710682869587')
    .row()
    .url('БОТ ПОМОЩНИК', 'https://t.me/hubbbhelp_bot')
    .icon('6030400221232501136')
    .row()
    .url('Написать разработчику?', 'https://t.me/vitaly_kolodchenko')
    .icon('5818813162815753343')
    .row()

  kb.text('◀️ Назад', packCb({ a: 'home' }))

  // .text('❌ Завершить диалог', packCb({ a: 'end_support' })).row()

  return {
    photo: './public/help.jpg',
    caption:
      'Если появились вопросы по работе ХАБ КОМЬЮНИТИ, сложности с ботом или вы обнаружили ошибку — напишите нам.\n\nВыбирите раздел 👇',

    keyboard: kb,
  }
}
