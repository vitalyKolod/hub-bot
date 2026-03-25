// src/screens/support.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function supportScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard().text('❌ Завершить диалог', packCb({ a: 'end_support' })).row()

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
