// src/screens/cmg.ts

import { FormattedString } from '@grammyjs/parse-mode'

import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'
import { buildProductPurchaseKeyboard } from './product-purchase.js'

export async function cmgScreen(userId: number, teamId: string): Promise<ScreenView> {
  const product = getProduct('cmg')

  if (!product) {
    throw new Error('Product "cmg" not found')
  }
  const kb = await buildProductPurchaseKeyboard(teamId, 'cmg')

  // ============================================================
  // ТЕКСТ
  // ============================================================

  let message = new FormattedString('')

  // ============================================================
  // ЗАГОЛОВОК
  // ============================================================

  message = message
    .emoji('🛜', '5310127020213043624')
    .plain(' ')
    .bold('CHURCH MOTION GRAPHICS (CMG)')
    .plain('\n\n')

  // ============================================================
  // ОПИСАНИЕ
  // ============================================================

  message = message
    .plain('Библиотека motion-графики и анимированных фонов для церковных презентаций.')
    .plain('\n\n')

  // ============================================================
  // ПРЕИМУЩЕСТВА
  // ============================================================

  let benefits = new FormattedString('')

  benefits = benefits
    .emoji('🎬', '5980930633298350051')
    .plain(' Большая библиотека motion-графики\n')

    .emoji('✨', '5980930633298350051')
    .plain(' Анимированные фоны для презентаций\n')

    .emoji('⛪', '5980930633298350051')
    .plain(' Контент специально для церковного служения\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(benefits, true).plain('\n\n')

  message = message.plain('💰 ').bold(`Стоимость: ${product.price} ₽/год`)

  return {
    photo: './public/cmg.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
