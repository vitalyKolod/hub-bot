// src/screens/other.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function otherScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.url('ЧАТ С АДМИНОМ', 'https://t.me/k1r4r1k').icon('5465300082628763143').row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))


  let message = new FormattedString('')


  message = message.bold('ДРУГИЕ СЕРВИСЫ').plain('\n\n')


  message = message
    .plain(
      'Если вам нужна цифровая подписка или сервис, который недоступен в РФ, мы поможем подобрать способ оплаты и подключить его.'
    )
    .plain('\n\n')



  let services = new FormattedString('')

  services = services
    .emoji('💎', '5980930633298350051')
    .plain(
      ' Премиум-сервисы: программы, облачные сервисы, библиотеки контента и многое другое.\n\n'
    )

    .emoji('🔐', '5980930633298350051')
    .plain(' Доступ к аккаунтам, потокам и лицензиям.\n\n')

    .emoji('🎵', '5980930633298350051')
    .plain(' Всё, что связано с worship, музыкой, видео и софтом для церквей.')

  message = message.blockquote(services, true).plain('\n\n')



  message = message.plain(
    'Просто напишите админу в чат — обсудим детали, стоимость и сроки. Мы подберём оптимальный способ оплаты и предоставим доступ на ваш аккаунт.'
  )

 

  return {
    photo: './public/others.jpg',

    caption: message.caption,
    caption_entities: message.caption_entities,

    caption:
      `Если вам нужна цифровая подписка или сервис, самостоятельное подключение которого недоступно из РФ, мы постараемся помочь!\n\n` +
      `Через ХАБ можно получить помощь с доступом к:\n` +
      `• Любые премиум-сервисы (программы, облака, библиотеки контента и т.д.)\n` +
      `• Доступ к аккаунтам, потокам, лицензиям\n` +
      `• Всё, что связано с worship, музыкой, видео, софтом для церквей\n\n` +
      `Напишите администратору в чат — обсудим детали, рекомендуемый размер пожертвования и сроки.\n` +
      `Мы подберём удобный способ перевода и поможем настроить доступ на вашем аккаунте.\n\n` +
      `Готовы помочь — жмите кнопку ниже!`,


    keyboard: kb,
  }
}
