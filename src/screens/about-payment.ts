// src/screens/payment.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function aboutPaymentScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ПРИОБРЕСТИ ПОДПИСКУ',
    packCb({
      a: 'open',
      s: 'add_subscription',
    })
  )
    .icon('5310257187786878602')
    .row()

  kb.text(
    'ПОДРОБНЕЕ ОБ ОПЛАТЕ',
    packCb({
      a: 'open',
      s: 'payment_details',
      p: { page: 1 },
    })
  )
    .icon('5215209935188534658')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
    .text('НА ГЛАВНУЮ', packCb({ a: 'home' }))
    .icon('5465226866321268133')

  let message = new FormattedString('')

  // Описание
  message = message
    .plain(
      'Вы можете совершить оплату вашей подписки или любого другого продукта ХАБа несколькими способами.'
    )
    .plain('\n\n')

  // Способы оплаты
  let paymentMethods = new FormattedString('')

  paymentMethods = paymentMethods
    .emoji('💳', '5328309412073335328')
    .plain(' Рублёвый перевод\n')

    .emoji('💰', '5330192398750342389')
    .plain(' Криптовалютный перевод в USDT ')
    .italic('(предпочтительнее)')

  message = message.blockquote(paymentMethods, true).plain('\n\n')

  message = message.plain('Выберите удобный вариант ниже.')

  return {
    photo: './public/about-payment.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
