// src/screens/cmg.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function cmgScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `cmg:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text(
    '🛒 В корзину',
    packCb({
      a: 'add_to_cart',
      p: `cmg:${teamId}`,
    })
  ).row()

  kb.text(
    '🛒 Перейти в корзину',
    packCb({
      a: 'open',
      s: 'cart',
      p: teamId,
    })
  ).row()

  kb.url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot').icon('5436113877181941026').row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

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

  // ============================================================
  // СТОИМОСТЬ
  // ============================================================

  message = message.plain('💰 ').bold('Стоимость: 2000 ₽/год')

  // ============================================================
  // RETURN
  // ============================================================

  return {
    photo: './public/cmg.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
