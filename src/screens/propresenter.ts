// src/screens/propresenter.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ПОДАТЬ ЗАЯВКУ НА ПОДКЛЮЧЕНИЕ',
    packCb({
      a: 'open',
      s: 'propresenter_check',
      p: teamId,
    })
  )
    .icon('5215209935188534658')
    .row()


  kb.url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot').icon('5436113877181941026').row()


    .url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot')
    .icon('5436113877181941026')
    .row()
  // kb.text('Поддержать проект', packCb({ a: 'pay_product', p: 'propresenter' }))
  //   .icon('5318912792428814144')
  //   .row()
  kb.row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  let message = new FormattedString('')

  let info = new FormattedString('')

  info = info
    .emoji('📖', '5980930633298350051')
    .plain(
      ' Профессиональная программа для управления слайдами, видео, текстом и worship-контентом в церквях.\n\n'
    )

    .emoji('✨', '5980930633298350051')
    .plain(
      ' Основные возможности программы позволяют создавать презентации, управлять видео, текстами песен и другим контентом.\n\n'
    )

    .emoji('💰', '5980930633298350051')
    .plain(
      ' Стоимость «в складчину» через ХАБ: 40$/год.\n' +
        ' Или от 3750₽/год в зависимости от курса USDT на P2P.\n\n'
    )

    .emoji('📡', '5980930633298350051')
    .plain(' Доступ предоставляется через приватный ПОТОК.')

  message = message
    .emoji('ℹ️', '5251272469175631339')
    .bold('ProPresenter')
    .plain('\n')
    .blockquote(info, true)
    .plain('\n\n')
    .plain('Выберите действие ниже:')

  return {
    photo: './public/propres.jpg',

    caption: message.caption,
    caption_entities: message.caption_entities,

    caption:
      `*ProPresenter*— профессиональная программа для управления слайдами, видео, текстом и worship-контентом в церквях.\n\n` +
      `*Основные возможности описаны на*` +
      `[ сайте разработчика](https://www.renewedvision.com/propresenter)\n\n` +
      `💰 *Рекомендуемое пожертвование через ХАБ: 40$/год*\n` +
      `или от 3750₽/год (в зависимости от курса USDT на P2P)\n\n` +
      `📡 *Доступ через приватный ПОТОК:*\n\n` +
      `➕ *Выберите действие ниже:*`,


    keyboard: kb,
  }
}
