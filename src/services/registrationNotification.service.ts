import { InlineKeyboard } from 'grammy'
import { UserModel } from '../models/User.js'
import { ADMIN_GROUP_ID } from '../config/env.js'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export async function notifyRegisteredUser(api: any, userId: number, sessionUsername?: string) {
  const profile = await UserModel.findOne({ telegramId: userId })
  if (!profile) throw new Error(`Registered user ${userId} was not found`)

  const username = String(profile.username || sessionUsername || '').replace(/^@/, '')
  const text = [
    '🆕 <b>НОВАЯ РЕГИСТРАЦИЯ</b>',
    '────────────',
    '',
    `👤 <b>ФИО:</b> ${escapeHtml(profile.fio || '—')}`,
    `🏙 <b>Город:</b> ${escapeHtml(profile.city || '—')}`,
    `⛪ <b>Церковь:</b> ${escapeHtml(profile.church || '—')}`,
    '',
    `😎 <b>Юзернейм:</b> ${username ? `@${escapeHtml(username)}` : '—'}`,
    `🆔 <b>ID:</b> <code>${userId}</code>`,
    '',
    `🕒 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`,
  ].join('\n')

  console.info(
    `[registration] Sending admin notification userId=${userId} chatId=${ADMIN_GROUP_ID} destination=general`
  )
  await api.sendMessage(ADMIN_GROUP_ID, text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().url('👤 Открыть Telegram-профиль', `tg://user?id=${userId}`),
  })
  console.info(
    `[registration] Admin notification sent userId=${userId} chatId=${ADMIN_GROUP_ID} destination=general`
  )
}
