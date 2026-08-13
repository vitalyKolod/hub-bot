import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function cardMethods(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'МИР',
    packCb({
      a: 'rub_card_type',
      m: 'mir',
    })
  )
    .icon('5461071584246638157')
    .row()

  kb.text(
    'MasterCard',
    packCb({
      a: 'rub_card_type',
      m: 'mastercard',
    })
  )
    .icon('5190642511802022990')
    .row()

  kb.row()

  kb.text(
    '◀️ НАЗАД',
    packCb({
      a: 'open',
      s: 'rub_methods',
    })
  )

  kb.text(
    'К СПОСОБАМ',
    packCb({
      a: 'open',
      s: 'payment',
    })
  ).icon('5332600543963522398')

  let message = new FormattedString('')

  message = message
    .emoji('▫️', '5445001203899456524')
    .plain(' ')
    .bold('ОПЛАТА БАНКОВСКОЙ КАРТОЙ')
    .plain('\n\n')

  message = message.plain('Выберите платёжную систему вашей карты:').plain('\n\n')

  let quote = new FormattedString('')

  quote = quote
    .emoji('▫️', '5980930633298350051')
    .plain('Поддерживаются карты МИР и MasterCard')
    .plain('\n')

  quote = quote
    .emoji('▫️', '5980930633298350051')
    .plain('После выбора системы вы получите дальнейшие инструкции')

  message = message.blockquote(quote, true).plain('\n\n')

  message = message.plain('Выберите подходящий вариант ниже.')

  return {
    photo: './public/methods-rub.jpg',


    caption: message.caption,
    caption_entities: message.caption_entities,


    caption:
      `*💳 Добровольное пожертвование переводом на карту*\n\n` +
      `Пожалуйста, выберите систему карты:\n\n` +
      `MasterCard / МИР\n`,

    keyboard: kb,
  }
}
