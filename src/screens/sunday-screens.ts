// src/screens/sunday-screens.ts

import { FormattedString } from '@grammyjs/parse-mode'

import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'
import { buildProductPurchaseKeyboard } from './product-purchase.js'

export async function SundayScreensScreen(userId: number, teamId: string): Promise<ScreenView> {
  const product = getProduct('sunday_screens')

  if (!product) {
    throw new Error('Product "sunday_screens" not found')
  }
  const kb = await buildProductPurchaseKeyboard(teamId, 'sunday_screens')

  let message = new FormattedString('')

  message = message
    .emoji('☀️', '5291749654017381020')
    .plain(' ')
    .bold('SUNDAY SCREENS')
    .plain('\n\n')

  message = message
    .plain(
      'Профессиональная платформа с визуальными фонами, анимациями и графикой для экранов во время богослужений.'
    )
    .plain('\n\n')

  let benefits = new FormattedString('')

  benefits = benefits
    .emoji('🎬', '5980930633298350051')
    .plain(' Красивые движущиеся фоны и анимированные слайды\n')

    .emoji('🎨', '5980930633298350051')
    .plain(' Готовые шаблоны для песен, проповедей и объявлений\n')

    .emoji('🖥', '5980930633298350051')
    .plain(' Поддержка различных экранов и программ проекции\n')

    .emoji('💎', '5980930633298350051')
    .plain(' Доступ к библиотеке HD/4K контента без ограничений')

  message = message.blockquote(benefits, true).plain('\n\n')

  message = message
    .plain('💰')
    .bold(`Стоимость в год: ${product.priceRub}₽ или ${product.priceUsd}$\n\n`)

  message = message.plain('Доступ через приватный поток — без ограничений и блокировок.')

  return {
    photo: './public/sunday-screens.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
