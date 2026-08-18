// src/screens/cgs.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'

export function cgsScreen(userId: number, teamId: string): ScreenView {
  const product = getProduct('cgs')
  if (!product) {
    throw new Error('Product "cgs" not found')
  }
  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `cgs:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text(
    '🛒 В КОРЗИНУ',
    packCb({
      a: 'add_to_cart',
      p: `cgs:${teamId}`,
    })
  ).row()

  kb.text(
    '🛒 ПЕРЕЙТИ В КОРЗИНУ',
    packCb({
      a: 'open',
      s: 'cart',
      p: teamId,
    })
  ).row()

  kb.url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot').icon('5436113877181941026').row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  let message = new FormattedString('')

  message = message.emoji('▫️', '5190419001703963847').plain(' ').bold('CGS').plain('\n\n')

  message = message
    .plain('Библиотека графики и визуального контента для церковных презентаций и служений.')
    .plain('\n\n')

  let benefits = new FormattedString('')

  benefits = benefits
    .emoji('🎨', '5980930633298350051')
    .plain(' Готовая графика для презентаций\n')

    .emoji('✨', '5980930633298350051')
    .plain(' Визуальные элементы для оформления служений\n')

    .emoji('🖥', '5980930633298350051')
    .plain(' Контент для экранов и церковных мероприятий\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(benefits, true).plain('\n\n')

  message = message.plain('💰 ').bold(`Стоимость: ${product.price} ₽/год`)

  return {
    photo: './public/content.jpg',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
