import { InlineKeyboard } from 'grammy'
import { config } from '../config.js'
import { packCb } from '../core/callback.js'
import { ScreenView } from '../core/render.js'
import { PRODUCT_PRICES } from './payment.js'

export function cryptoPaymentScreen(
  userId: number,
  params?: { network: string; product?: string }
): ScreenView {
  const kb = new InlineKeyboard()
  kb.text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' }))
    .icon('5317013291602553603')
    .row()
  kb.row()
  kb.text('◀️ НАЗАД', packCb({ a: 'open', s: 'crypto_method' }))
    .text('К СПОСОБАМ', packCb({ a: 'open', s: 'payment' }))
    .icon('5332600543963522398')

  const network = params?.network || 'trc20'
  const product = params?.product || 'default'

  // берем адрес из config по сети
  let wallet: string = config.PAYMENT_USDT
  if (network === 'erc20') wallet = config.PAYMENT_USDT_ERC20
  else if (network === 'ton') wallet = config.PAYMENT_TON
  else if (network === 'bybit') wallet = config.PAYMENT_BYBIT

  // сумма по продукту
  let amount = PRODUCT_PRICES[product]
  if (product === 'content_screens') amount = config.PRICE_CONTENT
  else if (product === 'propresenter') amount = config.PRICE_PROPRESENTER

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — КРИПТА (${network.toUpperCase()})*\n\n` +
      `Сеть: **${network.toUpperCase()}**\n` +
      `Сумма: **${amount}**\n\n` +
      `Адрес кошелька:\n\`\`\`\n${wallet}\n\`\`\`\n\n` +
      `После перевода нажмите кнопку *Я ОПЛАТИЛ(А)* и пришлите чек (фото или документ).`,
    keyboard: kb,
  }
}
