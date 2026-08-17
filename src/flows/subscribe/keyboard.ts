import { InlineKeyboard } from 'grammy'

const CHANNEL_URL = 'https://t.me/+ZAMZ3oP2Cs41MGYy'

export function subscribeKeyboard() {
  return new InlineKeyboard()
    .url('📢 Подписаться', CHANNEL_URL)
    .row()
    .text('Я подписался', 'subscribe:check')
    .icon('5237794483843655211')
}
