// src/screens/other.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function otherScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()
    .url('ЧАТ С АДМИНОМ', 'https://t.me/k1r4r1k')
    .icon('5465300082628763143')
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/others.jpg',
    caption:
      `*Если вам нужна любая другая цифровая подписка или сервис, который недоступен в РФ (например, через прямую оплату из России заблокирован), мы поможем!\n\n` +
      `Через ХАБ вы можете оплатить:\n` +
      `• Любые премиум-сервисы (программы, облака, библиотеки контента и т.д.)\n` +
      `• Доступ к аккаунтам, потокам, лицензиям\n` +
      `• Всё, что связано с worship, музыкой, видео, софтом для церквей\n\n` +
      `Просто напишите админу в чат — обсудим детали, стоимость и сроки.\n` +
      `Мы подберём оптимальный способ оплаты и предоставим доступ на ваш аккаунт.\n\n` +
      `Готовы помочь — жмите кнопку ниже!`,

    keyboard: kb,
  }
}
