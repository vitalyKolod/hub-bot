import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import { getProduct } from '../config/products.js'
import { getOrCreateCart, getPendingItems, getCartTotal } from '../services/cart.service.js'

import type { ScreenView } from '../core/render.js'

export async function paymentScreen(userId: number, params: any, ctx: any): Promise<ScreenView> {
  const payment = ctx?.session?.payment
  const product = payment?.product || 'unknown'
  const teamId = payment?.teamId
  const isExtension = payment?.isExtension

  let productName = 'подписка'
  let amount: number | null = null

  if (product === 'cart' && teamId) {
    const cart = await getOrCreateCart(teamId)
    const items = getPendingItems(cart)

    productName =
      items.map((i: any) => getProduct(i.product)?.name || i.product).join(', ') || 'корзина'

    amount = getCartTotal(cart)
  } else {
    const productConfig = getProduct(product)

    productName = productConfig?.name || 'подписка'
    amount = productConfig?.price ?? null
  }

  const kb = new InlineKeyboard()

  kb.text(
    'РУБЛИ',
    packCb({
      a: 'open',
      s: 'rub_methods',
    })
  ).icon('5213291343232645210')

  kb.text(
    'КРИПТА · USDT',
    packCb({
      a: 'open',
      s: 'crypto_method',
    })
  )
    .icon('5460978422111021593')
    .row()

  kb.row()

  kb.text(
    '◀️ НАЗАД',
    packCb({
      a: 'back',
    })
  )

  kb.text(
    'НА ГЛАВНУЮ',
    packCb({
      a: 'home',
    })
  ).icon('5465226866321268133')

  let message = new FormattedString('')

  message = message
    .emoji(isExtension ? '🔄' : '▫️', '5332600543963522398')
    .plain(' ')
    .bold(isExtension ? 'ПРОДЛЕНИЕ ПОДПИСКИ' : 'ОПЛАТА')
    .plain('\n\n')

  // Информация о товаре
  let order = new FormattedString('')

  order = order.plain('Продукт: ').bold(productName).plain('\n')

  order = order
    .plain('Стоимость: ')
    .bold(amount !== null ? `${amount.toLocaleString('ru-RU')} ₽/год` : 'по договорённости')

  message = message.blockquote(order, true).plain('\n\n')

  if (isExtension) {
    let extension = new FormattedString('')

    extension = extension
      .bold('При продлении:')
      .plain('\n')
      .plain('• К текущему сроку добавится +1 год\n')
      .plain('• Все оставшиеся дни сохранятся')

    message = message.blockquote(extension, true).plain('\n\n')
  }

  message = message.plain('Выберите удобный способ оплаты ниже.')

  return {
    photo: './public/payment.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
