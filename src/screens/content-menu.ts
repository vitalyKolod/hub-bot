// src/screens/content-menu.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export async function contentMenuScreen(userId: number, teamId: string): Promise<ScreenView> {
  const kb = new InlineKeyboard()

  kb.text('ProContent', packCb({ a: 'open', s: 'procontent', p: teamId }))
    .icon('5251299351375937406')
    .row()
  kb.text('Sunday Screens', packCb({ a: 'open', s: 'sunday_screens', p: teamId }))
    .icon('5291749654017381020')
    .row()
  kb.text('StoryLoop', packCb({ a: 'open', s: 'storyloops', p: teamId }))
    .icon('5190877553887323413')
    .row()
  kb.text('CMG', packCb({ a: 'open', s: 'cmg', p: teamId })).icon('5310127020213043624')

  kb.text('CGS', packCb({ a: 'open', s: 'cgs', p: teamId }))
    .icon('5190419001703963847')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))

  let message = new FormattedString('')

  message = message
    .bold('КОНТЕНТ ДЛЯ ЭКРАНОВ')
    .plain('\n')
    .plain('Выберите нужное направление:')
    .plain('\n\n')

  let directions = new FormattedString('')

  directions = directions
    .emoji('🖥', '5251299351375937406')
    .plain(' ProContent\n')

    .emoji('🎨', '5310127020213043624')
    .plain(' CMG\n')

    .emoji('📺', '5291749654017381020')
    .plain(' Sunday Screens\n')

    .emoji('✨', '5190419001703963847')
    .plain(' CGS\n')

    .emoji('🎞', '5190877553887323413')
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
