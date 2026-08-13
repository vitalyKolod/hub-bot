// src/screens/storyloops.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function storyloopsScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `storyloops:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text(
    '🛒 В КОРЗИНУ',
    packCb({
      a: 'add_to_cart',
      p: `storyloops:${teamId}`,
    })
  ).row()

  kb.text(
    '🛒 ПЕРЕЙТИ В КОРЗИНУ',
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

  // ============================================================
  // СТОИМОСТЬ
  // ============================================================

  message = message.plain('💰 ').bold('Стоимость: 2000 ₽/год')

  // ============================================================
  // RETURN
  // ============================================================

  return {
    photo: './public/content.jpg',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
