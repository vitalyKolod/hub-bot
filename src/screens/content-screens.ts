// src/screens/procontent.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function procontentScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()


  kb.text(
    'ОПЛАТИТЬ СРАЗУ',
    packCb({
      a: 'pay_product',
      p: `procontent:${teamId}`,
    })
  )

  kb.text('ПОДДЕРЖАТЬ ПРОЕКТ', packCb({ a: 'pay_product', p: 'content_screens' }))

    .icon('5318912792428814144')
    .row()


  kb.text(
    '🛒 В корзину',
    packCb({
      a: 'add_to_cart',
      p: `procontent:${teamId}`,
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

  let message = new FormattedString('')

  message = message.emoji('📦', '5251299351375937406').plain(' ').bold('PROCONTENT').plain('\n\n')

  message = message.plain('Большая библиотека видеоконтента для церквей:').plain('\n\n')

  return {
    photo: './public/content.jpg',
    caption:
      `📦 Доступ в закрытый чат «Контент для экранов (ХАБ)»\n\n` +
      `🎬 Sunday Screens
💎 ProContent
Church Motion Graphics (CMG)\n` +
      `
— это 3 большие библиотеки видеоконтента для церквей:

• видеофоны и лупы
• motion-фоны
• сезонные паки
• шаблоны объявлений и презентаций (PSD)
• и многое другое

Весь контент уже доступен в удобном закрытом чате
и регулярно пополняется 🔄
\n` +
      `💰 Рекомендуемое пожертвование: от 10$ / ~1000₽\n` +
      `
— доступ на 12 месяцев
— сразу 3 направления
— можно подключить членов вашей команды
\n` +
      `➕Интересно? Подключаем?`,


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

  message = message.plain('💰 ').bold('Стоимость: 1000 ₽/год')

  return {
    photo: './public/procontent.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
