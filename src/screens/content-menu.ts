// src/screens/content-menu.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getProduct } from '../config/products.js'
import { getCartCount, cartNavigationLabel } from '../utils/cartButton.js'

export async function contentMenuScreen(userId: number, teamId: string): Promise<ScreenView> {
  const kb = new InlineKeyboard()

  kb.text('ProContent', packCb({ a: 'open', s: 'procontent', p: teamId }))
    .icon(getProduct('procontent')!.customEmojiId!)
    .row()
  kb.text('Sunday Screens', packCb({ a: 'open', s: 'sunday_screens', p: teamId }))
    .icon(getProduct('sunday_screens')!.customEmojiId!)
    .row()
  kb.text('StoryLoop', packCb({ a: 'open', s: 'storyloops', p: teamId }))
    .icon(getProduct('storyloops')!.customEmojiId!)
    .row()
  kb.text('CMG', packCb({ a: 'open', s: 'cmg', p: teamId })).icon(getProduct('cmg')!.customEmojiId!)

  kb.text('CGS', packCb({ a: 'open', s: 'cgs', p: teamId }))
    .icon(getProduct('cgs')!.customEmojiId!)
    .row()

  kb.text(cartNavigationLabel(await getCartCount(teamId)), packCb({ a: 'open', s: 'cart', p: teamId })).row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  let message = new FormattedString('')

  message = message
    .bold('КОНТЕНТ ДЛЯ ЭКРАНОВ')
    .plain('\n')
    .plain('Выберите нужное направление:')
    .plain('\n\n')

  let directions = new FormattedString('')

  directions = directions
    .emoji('🖥', getProduct('procontent')!.customEmojiId!)
    .plain(' ProContent\n')

    .emoji('🎨', getProduct('cmg')!.customEmojiId!)
    .plain(' CMG\n')

    .emoji('📺', getProduct('sunday_screens')!.customEmojiId!)
    .plain(' Sunday Screens\n')

    .emoji('✨', getProduct('cgs')!.customEmojiId!)
    .plain(' CGS\n')

    .emoji('🎞', getProduct('storyloops')!.customEmojiId!)
    .plain(' StoryLoop')

  message = message
    .blockquote(directions, true)
    .plain('\n\n')
    .plain('Каждое направление можно подключить отдельно.')

  return {
    photo: './public/content.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard: kb,
  }
}
