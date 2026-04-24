import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

export function contentScreensScreen(userId: number): ScreenView {
  const kb = new InlineKeyboard()

    .url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot')
    .icon('5436113877181941026')
    .row()
  kb.text('ОПЛАТИТЬ', packCb({ a: 'pay_product', p: 'content_screens' }))
    .icon('5318912792428814144')
    .row()
  kb.row()
  kb.text('◀️ Назад', packCb({ a: 'back' }))

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
      `💰 Стоимость от 10$ / ~1000₽ в год\n` +
      `
— доступ на 12 месяцев
— сразу 3 направления
— можно подключить членов вашей команды
\n` +
      `➕Интересно? Подключаем?`,

    keyboard: kb,
    parse_mode: 'HTML',
  }
}
