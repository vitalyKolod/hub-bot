import { InlineKeyboard } from 'grammy'

const CHANNEL_URL = 'https://t.me/habpublic'

export function subscribeKeyboard() {
  return new InlineKeyboard()
    .url('📢 Подписаться', CHANNEL_URL)
    .row()
    .text('✅ Я подписался', 'subscribe:check')
}
