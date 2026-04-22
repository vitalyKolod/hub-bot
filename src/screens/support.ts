// src/screens/support.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function supportScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

    .url('Вопрос по подписке?', 'https://t.me/k1r4r1k')
    .icon('5332600543963522398')
    .url('Вопрос по обучению?', 'https://t.me/imacport')
    .icon('5472411062412254753')

    .url('Вопрос на счет программы?', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5251272469175631339')

    .url('Вопрос по боту?', 'https://t.me/+ZAMZ3oP2Cs41MGYy')
    .icon('5818813162815753343')
    .url('Бот помощник', 'https://t.me/hubbbhelp_bot')
    .row()
  kb.text('◀️ Назад', packCb({ a: 'home' }))

  // .text('❌ Завершить диалог', packCb({ a: 'end_support' })).row()

  return {
    photo: './public/profile.png',
    caption:
      `*ЧАТ С ПОДДЕРЖКОЙ*\n\n` +
      `Вы в режиме общения с поддержкой.\n\n` +
      `Теперь **любое** ваше сообщение (текст, фото, видео, голосовое, кружок, документ) ` +
      `автоматически будет отправлено админам.\n\n` +
      `Пожалуйста, не нажимайте другие кнопки бота, пока идёт диалог.`,

    keyboard: kb,
  }
}
