// crypto-payment.ts
import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { config } from '../config.js'
import { packCb } from '../core/callback.js'
import { getProduct } from '../config/products.js'
import { getOrCreateCart, getPendingItems, getCartTotal } from '../services/cart.service.js'

import type { ScreenView } from '../core/render.js'

export async function cryptoPaymentScreen(
  userId: number,
  params?: {
    network: string
    product?: string
    teamId?: string
  }
): Promise<ScreenView> {
  const kb = new InlineKeyboard()

  kb.text(
    'Я ОПЛАТИЛ(А)',
    packCb({
      a: 'paid',
    })
  )
    .icon('5317013291602553603')
    .row()

  kb.row()

  kb.text(
    '◀️ НАЗАД',
    packCb({
      a: 'open',
      s: 'crypto_method',
    })
  )

  kb.text(
    'К СПОСОБАМ',
    packCb({
      a: 'open',
      s: 'payment',
    })
  ).icon('5332600543963522398')

  const network = params?.network || 'trc20'

  let wallet: string = config.PAYMENT_USDT

  if (network === 'erc20') {
    wallet = config.PAYMENT_USDT_ERC20
  } else if (network === 'ton') {
    wallet = config.PAYMENT_TON
  } else if (network === 'bybit') {
    wallet = config.PAYMENT_BYBIT
  }

  const networkMap: Record<string, string> = {
    trc20: 'USDT · TRC20',
    erc20: 'USDT · ERC20',
    ton: 'TON',
    bybit: 'BYBIT',
  }

  const networkName = networkMap[network] || network.toUpperCase()

  let productName = ''
  let amount: number | null = null

  if (params?.product === 'cart' && params.teamId) {
    const cart = await getOrCreateCart(params.teamId)
    const items = getPendingItems(cart)

    productName = items.map((i: any) => getProduct(i.product)?.name || i.product).join(', ')

    amount = getCartTotal(cart, 'usd')
  } else {
    const productConfig = getProduct(params?.product || '')

    productName = productConfig?.name || params?.product || ''

    amount = productConfig?.priceUsd ?? null
  }

  let message = new FormattedString('')

  message = message
    .emoji('▫️', '5328309412073335328')
    .plain(' ')
    .bold('ОПЛАТА — КРИПТА')
    .plain('\n\n')

  message = message.plain('Проверьте данные перед переводом.').plain('\n\n')

  let order = new FormattedString('')

  order = order.plain('Товар: ').bold(productName).plain('\n')

  order = order.plain('Сеть: ').bold(networkName).plain('\n')

  order = order
    .plain('Сумма: ')
    .bold(amount !== null ? `${amount.toLocaleString('ru-RU')} USDT` : 'по договорённости')

  message = message.blockquote(order, true).plain('\n\n')

  message = message.emoji('💰', '5296738331546098668').bold('РЕКВИЗИТЫ').plain('\n\n')

  message = message.code(wallet).plain('\n\n')

  message = message.italic('Нажмите на адрес, чтобы скопировать').plain('\n\n')

  let receiver = new FormattedString('')

  receiver = receiver.plain('Сеть: ').bold(networkName)

  message = message.blockquote(receiver, true).plain('\n\n')

  message = message.plain('После перевода нажмите ').bold('«Я ОПЛАТИЛ(А)»').plain('.')

  return {
    photo: './public/methods-crypto.jpg',

    caption: message.caption,
    caption_entities: message.caption_entities,

    keyboard: kb,
  }
}
