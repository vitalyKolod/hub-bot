import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function sbpMethodsScreen(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'Т-банк',
    packCb({
      a: 'rub_bank',
      m: 'tbank',
    })
  )
    .icon('5341547063920320472')
    .row()

  kb.text(
    'Озон-банк',
    packCb({
      a: 'rub_bank',
      m: 'ozon',
    })
  )
    .icon('5463148170869482726')
    .row()

  kb.text(
    'Альфа-банк',
    packCb({
      a: 'rub_bank',
      m: 'alfa',
    })
  )
    .icon('5397797559106285689')
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
    .emoji('▫️', '5368446439800197476')
    .plain(' ')
    .bold('ОПЛАТА ЧЕРЕЗ СБП')
    .plain('\n\n')

  message = message.plain('Выберите банк для оплаты:').plain('\n\n')

  let quote = new FormattedString('')

  quote = quote
    .emoji('📱', '5980930633298350051')
    .plain(' ')
    .plain('Перевод по номеру телефона')
    .plain('\n')

  quote = quote
    .emoji('⚡', '5980930633298350051')
    .plain(' ')
    .plain('Средства зачисляются моментально')

  message = message.blockquote(quote, true).plain('\n\n')

  message = message.plain('Выберите подходящий банк ниже.')

  return {
    photo: './public/methods-rub.jpg',


    caption: message.caption,
    caption_entities: message.caption_entities,


    caption:
      `*💸 Добровольное пожертвование через СБП*\n\n` +
      `Выберите удобный банк для перевода:\n\n` +
      `Перевод по номеру телефона\n` +
      `Средства зачисляются моментально.`,

    keyboard: kb,
  }
}
