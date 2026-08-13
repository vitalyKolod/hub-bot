import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import { config } from '../config.js'
import { getProduct } from '../config/products.js'
import { getOrCreateCart, getPendingItems, getCartTotal } from '../services/cart.service.js'

import type { ScreenView } from '../core/render.js'

export async function rubPaymentScreen(userId: number, params?: any): Promise<ScreenView> {
  const payment = params

  const kb = new InlineKeyboard()


  kb.text(
    'Я ОПЛАТИЛ(А)',
    packCb({
      a: 'paid',
    })
  )

  kb.text('Я ОТПРАВИЛ(А)', packCb({ a: 'paid' }))

    .icon('5317013291602553603')
    .row()

  kb.row()

  kb.text(
    '◀️ НАЗАД',
    packCb({
      a: 'back',
    })
  )

  kb.text(
    'К СПОСОБАМ',
    packCb({
      a: 'open',
      s: 'payment',
    })
  ).icon('5332600543963522398')

  if (!payment) {
    let message = new FormattedString('')

    message = message
      .emoji('▫️', '5190419001703963847')
      .plain(' ')
      .bold('ОПЛАТА')
      .plain('\n\n')
      .plain('Данные оплаты не найдены.')

    return {
      photo: './public/methods-rub.jpg',
      caption: message.caption,
      caption_entities: message.caption_entities,
      keyboard: new InlineKeyboard().text('◀️ НАЗАД', packCb({ a: 'back' })),
    }
  }

  let details = ''
  let methodText = ''

  if (payment.rubType === 'card') {
    if (payment.rubCardType === 'mastercard') {
      details = config.RUB_PAYMENT.card.mastercard
      methodText = 'MasterCard'
    } else {
      const bankNameMap: Record<string, string> = {
        tbank: 'Т-Банк',
        ozon: 'Озон',
        alfa: 'Альфа-Банк',
      }

      const bankName = bankNameMap[payment.rubBank]

      details = config.RUB_PAYMENT.card.mir[bankName]
      methodText = `МИР · ${bankName}`
    }
  }

  if (payment.rubType === 'sbp') {
    const bankNameMap: Record<string, string> = {
      tbank: 'Т-Банк',
      ozon: 'Озон',
      alfa: 'Альфа-Банк',
    }

    const bankName = bankNameMap[payment.rubBank]

    details = config.RUB_PAYMENT.sbp.phone
    methodText = `СБП · ${bankName}`
  }


  let productName = ''
  let amount: number | null = null

  if (payment.product === 'cart' && payment.teamId) {
    const cart = await getOrCreateCart(payment.teamId)
    const items = getPendingItems(cart)

    productName = items.map((i: any) => getProduct(i.product)?.name || i.product).join(', ')

    amount = getCartTotal(cart)
  } else {
    const productConfig = getProduct(payment.product)

    productName = productConfig?.name || payment.product
    amount = productConfig?.price ?? null

  if (!params) {
    return {
      photo: './public/methods-rub.jpg',
      caption: 'Ошибка: данные перевода не найдены',
      keyboard: new InlineKeyboard().text('Назад', packCb({ a: 'back' })),
    }

  }

  let message = new FormattedString('')

  message = message
    .emoji('▫️', '5328309412073335328')
    .plain(' ')
    .bold('ОПЛАТА — РУБЛИ')
    .plain('\n\n')

  message = message.plain('Проверьте данные перед переводом.').plain('\n\n')

  // Информация о заказе
  let order = new FormattedString('')

  order = order.plain('Товар: ').bold(productName).plain('\n')

  order = order.plain('Способ: ').bold(methodText).plain('\n')

  order = order
    .plain('Сумма: ')
    .bold(amount !== null ? `${amount.toLocaleString('ru-RU')} ₽` : 'по договорённости')

  message = message.blockquote(order, true).plain('\n\n')

  // Реквизиты
  message = message.emoji('💰', '5296738331546098668').bold('РЕКВИЗИТЫ').plain('\n\n')
  // Номер / реквизит для копирования
  message = message.code(details).plain('\n\n')
  message = message.italic('Нажмите на номер, чтобы скопировать').plain('\n\n')
  // Получатель
  let receiver = new FormattedString('')

  receiver = receiver.plain('Получатель: ').bold(config.PAYMENT_RECEIVER_NAME)

  message = message.blockquote(receiver, true).plain('\n\n')

  message = message
    // .emoji('⚡', '5980930633298350051')
    .plain(' ')
    .plain('После перевода нажмите ')
    .bold('«Я ОПЛАТИЛ(А)»')
    .plain('.')

  return {
    photo: './public/methods-rub.jpg',


    caption: message.caption,
    caption_entities: message.caption_entities,

    caption:
      `*ДОБРОВОЛЬНОЕ ПОЖЕРТВОВАНИЕ — РУБЛИ*\n\n` +
      `Способ: **${methodText}**\n\n` +
      `Рекомендуемая сумма: **${amount}**\n\n` +
      `Реквизиты:\n\`\`\`\n${details}\n\`\`\`\n\n` +
      `Получатель: ${config.PAYMENT_RECEIVER_NAME}\n\n` +
      `После перевода нажмите «Я ОТПРАВИЛ(А)»`,


    keyboard: kb,
  }
}
