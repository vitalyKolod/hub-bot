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
      `Если вам нужна цифровая подписка или сервис, самостоятельное подключение которого недоступно из РФ, мы постараемся помочь!\n\n` +
      `Через ХАБ можно получить помощь с доступом к:\n` +
      `• Любые премиум-сервисы (программы, облака, библиотеки контента и т.д.)\n` +
      `• Доступ к аккаунтам, потокам, лицензиям\n` +
      `• Всё, что связано с worship, музыкой, видео, софтом для церквей\n\n` +
      `Напишите администратору в чат — обсудим детали, сумму добровольного пожертвования и сроки.\n` +
      `Мы подберём удобный способ перевода и поможем настроить доступ на вашем аккаунте.\n\n` +
      `Готовы помочь — жмите кнопку ниже!`,

    keyboard: kb,
  }
}
