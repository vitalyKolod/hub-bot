import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import type { ScreenView } from '../core/render.js'

export function cryptoMethodScreen(userId: number, ctx: any): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('TRC20 USDT 🟢', packCb({ a: 'crypto_selected', m: 'trc20' })).row()
  kb.text('ERC20 USDT 🔵', packCb({ a: 'crypto_selected', m: 'erc20' })).row()
  kb.text('TON 🟡', packCb({ a: 'crypto_selected', m: 'ton' })).row()
  kb.text('Bybit 🟣', packCb({ a: 'crypto_selected', m: 'bybit' })).row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'open', s: 'payment' })).text(
    '🏠 На главную',
    packCb({ a: 'home' })
  )

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — КРИПТА*\n\nВыберите сеть для перевода:\n\n` +
      `После выбора адрес кошелька появится автоматически с возможностью копирования.`,
    keyboard: kb,
  }
}
