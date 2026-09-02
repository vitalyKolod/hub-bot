// src/screens/cgs.ts

import { FormattedString } from '@grammyjs/parse-mode'

import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'
import { buildProductPurchaseKeyboard } from './product-purchase.js'

export async function cgsScreen(userId: number, teamId: string): Promise<ScreenView> {
  const product = getProduct('cgs')
  if (!product) {
    throw new Error('Product "cgs" not found')
  }
  const kb = await buildProductPurchaseKeyboard(teamId, 'cgs')

  let message = new FormattedString('')

  message = message.emoji('▫️', '5190419001703963847').plain(' ').bold('CGS').plain('\n\n')

  message = message
    .plain('Библиотека графики и визуального контента для церковных презентаций и служений.')
    .plain('\n\n')

  let benefits = new FormattedString('')

  benefits = benefits
    .emoji('🎨', '5980930633298350051')
    .plain(' Готовая графика для презентаций\n')

    .emoji('✨', '5980930633298350051')
    .plain(' Визуальные элементы для оформления служений\n')

    .emoji('🖥', '5980930633298350051')
    .plain(' Контент для экранов и церковных мероприятий\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(benefits, true).plain('\n\n')

  message = message
    .plain('💰')
    .bold(`Стоимость в год: ${product.priceRub}₽ или ${product.priceUsd}$`)

  return {
    photo: './public/content.jpg',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
