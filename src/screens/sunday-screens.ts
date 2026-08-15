// src/screens/sunday-screens.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function SundayScreensScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `sunday_screens:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text(
    '🛒 В КОРЗИНУ',
    packCb({
      a: 'add_to_cart',
      p: `sunday_screens:${teamId}`,
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

  message = message
    .emoji('☀️', '5291749654017381020')
    .plain(' ')
    .bold('SUNDAY SCREENS')
    .plain('\n\n')

  // ============================================================
  // ОПИСАНИЕ
  // ============================================================

  message = message
    .plain(
      'Профессиональная платформа с визуальными фонами, анимациями и графикой для экранов во время богослужений.'
    )
    .plain('\n\n')

  // ============================================================
  // ПРЕИМУЩЕСТВА
  // ============================================================

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

  // ============================================================
  // СТОИМОСТЬ
  // ============================================================

  message = message.plain('💰 ').bold('Стоимость: 2000 ₽/год').plain('\n\n')

  // ============================================================
  // ДОСТУП
  // ============================================================

  message = message.plain('Доступ через приватный поток — без ограничений и блокировок.')

  // ============================================================
  // RETURN
  // ============================================================

  return {
    photo: './public/propres.jpg',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
