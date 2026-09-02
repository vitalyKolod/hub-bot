import { FormattedString } from '@grammyjs/parse-mode'

import { getProduct } from '../config/products.js'
import type { ScreenView } from '../core/render.js'
import { buildProductPurchaseKeyboard } from './product-purchase.js'

export async function procontentScreen(userId: number, teamId: string): Promise<ScreenView> {
  const product = getProduct('procontent')

  if (!product) {
    throw new Error('Product "procontent" not found')
  }

  const kb = await buildProductPurchaseKeyboard(teamId, 'procontent')

  let message = new FormattedString('')

  message = message.emoji('📦', '5251299351375937406').plain(' ').bold('PROCONTENT').plain('\n\n')

  message = message.plain('Большая библиотека видеоконтента для церквей:').plain('\n\n')

  let content = new FormattedString('')

  content = content
    .emoji('🎬', '5980930633298350051')
    .plain(' Видеофоны и лупы\n')

    .emoji('🎥', '5980930633298350051')
    .plain(' Motion-фоны\n')

    .emoji('🎞️', '5980930633298350051')
    .plain(' Сезонные паки\n')

    .emoji('🎨', '5980930633298350051')
    .plain(' Шаблоны  (PSD)\n')

    .emoji('🎵', '5980930633298350051')
    .plain(' И многое другое\n')

    .emoji('📅', '5980930633298350051')
    .plain(' Доступ на 12 месяцев\n')

    .emoji('👥', '5980930633298350051')
    .plain(' Можно подключить членов вашей команды')

  message = message.blockquote(content, true).plain('\n\n')

  message = message
    .plain('💰')
    .bold(`Стоимость в год: ${product.priceRub}₽ или ${product.priceUsd}$`)

  return {
    photo: './public/procontent.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
