// src/screens/confirmation.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProfile } from '../state/profile.js'

export function confirmationScreen(userId: number): ScreenView {
  const profile = getProfile(userId)

  const text =
    `*✅ ПРОВЕРЬТЕ СВОИ ДАННЫЕ*\n\n` +
    `👤 ФИО: ${profile.fio || 'не указано'}\n` +
    `📍 Город: ${profile.city || 'не указано'}\n` +
    `⛪ Церковь: ${profile.church || 'не указано'}\n\n` +
    `Всё верно?`

  const kb = new InlineKeyboard()
    .text('✅ Всё верно, продолжить', packCb({ a: 'confirm_data' }))
    .row()
    .text('✏️ Изменить ФИО', packCb({ a: 'edit_field', f: 'fio' }))
    .row()
    .text('✏️ Изменить город', packCb({ a: 'edit_field', f: 'city' }))
    .row()
    .text('✏️ Изменить церковь', packCb({ a: 'edit_field', f: 'church' }))

  return {
    photo: '', // ← пустая строка = без картинки
    caption: text,
    keyboard: kb,
  }
}
