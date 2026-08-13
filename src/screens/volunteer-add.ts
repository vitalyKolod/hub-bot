// src/screens/add-volunteer.ts

import { InlineKeyboard } from 'grammy'
import { FormattedString } from '@grammyjs/parse-mode'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function addVolunteerScreen(userId: number, teamId: string): ScreenView {
  const kb = new InlineKeyboard()

  kb.text(
    'ОПЛАТИТЬ',
    packCb({
      a: 'pay_product',
      p: `add_member:${teamId}`,
    })
  )
    .icon('5318912792428814144')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' })).text('🏠 НА ГЛАВНУЮ', packCb({ a: 'home' }))

  let message = new FormattedString('')

  message = message
    .bold('ДОБАВЛЕНИЕ УЧАСТНИКА')
    .plain('\n\n')
    .plain('Как это работает:')
    .plain('\n\n')

  let steps = new FormattedString('')

  steps = steps
    .emoji('1️⃣', '5188325338291122405')
    .plain(' Вы оплачиваете добавление одного участника.\n\n')

    .emoji('2️⃣', '5190877111505661578')
    .plain(' После подтверждения оплаты бот пришлёт вам персональную ссылку-приглашение.\n\n')

    .emoji('3️⃣', '5190668586548473202')
    .plain(' Вы отправляете эту ссылку человеку, которого хотите добавить.\n\n')

    .emoji('4️⃣', '5190528261376978203')
    .plain(
      ' Он переходит по ссылке, проходит короткую регистрацию (если ещё не регистрировался) и сразу попадает в вашу команду.'
    )

  message = message.blockquote(steps, true).plain('\n\n')

  message = message
    .emoji('⚠️', '5213181173026533794')
    .bold('Важно:')
    .plain(
      ' ссылка одноразовая и действует 24 часа — воспользоваться ей сможет только тот, кто первым нажмёт «Принять».'
    )
    .plain('\n\n')

  message = message.bold('Стоимость: ').plain('250 ₽')

  return {
    photo: './public/add-volunteer.png',

    caption: message.caption,
    caption_entities: message.caption_entities,

    caption:
      `*➕ ДОБАВЛЕНИЕ ВОЛОНТЁРА*\n\n` +
      `Перед тем как продолжить:\n\n` +
      `• Волонтёр должен *пройти регистрацию в боте*\n` +
      `• У него должен быть Telegram-аккаунт\n\n` +
      `После подтверждения добровольного пожертвования он получит доступ к чату 📺\n\n` +
      `Нажми кнопку ниже и отправь его контакт 👇`,

    keyboard: kb,
  }
}
