// src/keyboards.ts
import { InlineKeyboard } from 'grammy'

export function getMainMenu(remainingDays: number = 0) {
  const statusText = remainingDays > 0 ? `Осталось ${remainingDays} дней` : 'Подписка не активна'

  return new InlineKeyboard()
    .text('Продлить подписку', 'pay_extend') // callback_data уникальный
    .row()
    .text('Связаться с админом', 'contact_admin')
    .row()
    .text('Техподдержка', 'support')
    .row()
    .text('Правила и FAQ', 'faq')
}

export const mainMenuCaption = (days: number) => `
Личный кабинет

Ваша подписка: ProPresenter (годовая)
${days > 0 ? `Осталось: ${days} дней` : 'Подписка не активна'}
`

export const EXAMPLE_DAYS = 89
