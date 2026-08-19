// src/screens/storyloops.ts

import { FormattedString } from '@grammyjs/parse-mode'

import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'
import { buildProductPurchaseKeyboard } from './product-purchase.js'

export async function storyloopsScreen(userId: number, teamId: string): Promise<ScreenView> {
  const product = getProduct('storyloops')

  if (!product) {
    throw new Error('Product "storyloops" not found')
  }
  const kb = await buildProductPurchaseKeyboard(teamId, 'storyloops')

  // ============================================================
  // ТЕКСТ
  // ============================================================

  let message = new FormattedString('')

  // ============================================================
  // ЗАГОЛОВОК
  // ============================================================

  message = message.emoji('⬜️', '5190877553887323413').plain(' ').bold('STORYLOOPS').plain('\n\n')

  // ============================================================
  // ОПИСАНИЕ
  // ============================================================

  message = message
    .plain(
      'Коллекция анимированных фонов и визуальных материалов для создания атмосферных церковных презентаций.'
    )
    .plain('\n\n')

  // ============================================================
  // ПРЕИМУЩЕСТВА
  // ============================================================

  let benefits = new FormattedString('')

  benefits = benefits
    .emoji('🎞️', '5980930633298350051')
    .plain(' Анимированные фоны и loops\n')

    .emoji('✨', '5980930633298350051')
    .plain(' Атмосферный визуальный контент для служений\n')

    .emoji('🎬', '5980930633298350051')
    .plain(' Готовые материалы для экранов и презентаций\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(benefits, true).plain('\n\n')

  message = message.plain('💰 ').bold(`Стоимость: ${product.price} ₽/год`).plain('\n\n')

  return {
    photo: './public/content.jpg',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
