import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import { getProduct } from '../config/products.js'
import type { ScreenView } from '../core/render.js'

export function procontentScreen(userId: number, teamId: string): ScreenView {
  const product = getProduct('procontent')

  if (!product) {
    throw new Error('Product "procontent" not found')
  }

  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `procontent:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text(
    '🛒 В корзину',
    packCb({
      a: 'add_to_cart',
      p: `procontent:${teamId}`,
    })
  ).row()

  kb.text(
    '🛒 Перейти в корзину',
    packCb({
      a: 'open',
      s: 'cart',
      p: teamId,
    })
  ).row()

  kb.url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot').icon('5436113877181941026').row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  let message = new FormattedString('')

  message = message.emoji('📦', '5251299351375937406').plain(' ').bold('PROCONTENT').plain('\n\n')

  message = message.plain('Большая библиотека видеоконтента для церквей:').plain('\n\n')

  let content = new FormattedString('')

  content = content
    .emoji('🎬', '5980930633298350051')
    .plain(' Видеофоны и лупы\n')

    .emoji('🎥', '5980930633298350051')
    .plain(' Motion-фоны\n')

    .emoji('🎞️', '5980930633298350051')
    .plain(' Сезонные паки\n')

    .emoji('🎨', '5980930633298350051')
    .plain(' Шаблоны  (PSD)\n')

    .emoji('🎵', '5980930633298350051')
    .plain(' И многое другое\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(content, true).plain('\n\n')

  message = message.plain('💰 ').bold(`Стоимость: ${product.price} ₽/год`)

  return {
    photo: './public/procontent.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
