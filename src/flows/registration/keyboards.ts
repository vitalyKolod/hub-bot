import { InlineKeyboard } from 'grammy'

export function confirmationKeyboard() {
  return new InlineKeyboard()
    .text('✅ Подтвердить', 'confirm_registration')
    .text('✏️ Изменить', 'edit_registration')
}
