import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function cryptoMethodScreen(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('TRC20 USDT ', packCb({ a: 'crypto_selected', m: 'trc20' }))
    .icon('5397915949879801627')
    .row()
  kb.text('ERC20 USDT ', packCb({ a: 'crypto_selected', m: 'erc20' }))
    .icon('5433940370327088945')
    .row()
  kb.text('TON USDT', packCb({ a: 'crypto_selected', m: 'ton' }))
    .icon('5370546279375982437')
    .row()
  kb.text('Bybit(без комиссии)', packCb({ a: 'crypto_selected', m: 'bybit' }))
    .icon('5472387796574418157')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'payment' }))

    .text('В каталог', packCb({ a: 'open', s: 'add_subscription' }))
    .icon('5312361253610475399')

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — КРИПТА*\n\nВыберите сеть для перевода:\n\n` +
      `После выбора адрес кошелька появится автоматически с возможностью копирования.`,
    keyboard: kb,
  }
}
