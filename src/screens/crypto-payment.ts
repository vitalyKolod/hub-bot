import { InlineKeyboard } from 'grammy'
import { config } from '../config.js'
import { packCb } from '../core/callback.js'
import { ScreenView } from '../core/render.js'

export function cryptoPaymentScreen(
  userId: number,
  params?: { network: string; product?: string }
): ScreenView {
  const kb = new InlineKeyboard()
  kb.text('Я ОПЛАТИЛ(А)', packCb({ a: 'paid' })).row()
  kb.row()
  kb.text('◀️ К способам оплаты', packCb({ a: 'open', s: 'payment' })).text(
    '🏠 На главную',
    packCb({ a: 'home' })
  )

  const network = params?.network || 'trc20'
  const product = params?.product || 'default'

  // берем адрес из config по сети
  let wallet: string = config.PAYMENT_USDT
  if (network === 'erc20') wallet = config.PAYMENT_USDT_ERC20
  else if (network === 'ton') wallet = config.PAYMENT_TON
  else if (network === 'bybit') wallet = config.PAYMENT_BYBIT

  // сумма по продукту
  let amount = 'Не указано'
  if (product === 'content') amount = config.PRICE_CONTENT
  else if (product === 'propresenter') amount = config.PRICE_PROPRESENTER

  return {
    photo: './public/payment.png',
    caption:
      `*ОПЛАТА — КРИПТА (${network.toUpperCase()})*\n\n` +
      `Сеть: **${network.toUpperCase()}**\n` +
      `Сумма: **${amount}**\n\n` +
      `Адрес кошелька:\n\`\`\`\n${wallet}\n\`\`\`\n\n` +
      `Получатель: ${config.PAYMENT_RECEIVER_NAME}\n\n` +
      `После перевода нажмите кнопку **«Я ОПЛАТИЛ(А)»** и пришлите чек (фото или документ).`,
    keyboard: kb,
  }
}
