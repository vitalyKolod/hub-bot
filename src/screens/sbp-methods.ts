import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import type { ScreenView } from '../core/render.js'

export function sbpMethodsScreen(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Т-банк', packCb({ a: 'rub_bank', m: 'tbank' }))
    .icon('5341547063920320472')
    .row()
  kb.text('Озон-банк', packCb({ a: 'rub_bank', m: 'ozon' }))
    .icon('5463148170869482726')
    .row()
  kb.text('Альфа-банк', packCb({ a: 'rub_bank', m: 'alfa' }))
    .icon('5397797559106285689')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'rub_methods' }))

    .text('К способам', packCb({ a: 'open', s: 'payment' }))
    .icon('5332600543963522398')

  return {
    photo: './public/methods-rub.jpg',
    caption:
      `*💸 Оплата через СБП*\n\n` +
      `Выберите удобный вариант оплаты:\n\n` +
      `Перевод по номеру телефона\n` +
      `Средства зачисляются моментально.`,
    keyboard: kb,
  }
}
