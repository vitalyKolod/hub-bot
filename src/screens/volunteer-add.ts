import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function addVolunteerScreen(): ScreenView {
  const kb = new InlineKeyboard()

  kb.text('Отправить контакт волонтёра', packCb({ a: 'add_volunteer_contact' }))
    .icon('5467539229468793355')
    .row()

  kb.text('◀️ НАЗАД', packCb({ a: 'back' })).text('🏠 НА ГЛАВНУЮ', packCb({ a: 'home' }))

  return {
    photo: './public/others.jpg',
    caption:
      `*➕ ДОБАВЛЕНИЕ ВОЛОНТЁРА*\n\n` +
      `Перед тем как продолжить:\n\n` +
      `• Волонтёр должен *пройти регистрацию в боте*\n` +
      `• У него должен быть Telegram-аккаунт\n\n` +
      `После оплаты он получит доступ к чату 📺\n\n` +
      `Нажми кнопку ниже и отправь его контакт 👇`,
    keyboard: kb,
  }
}
