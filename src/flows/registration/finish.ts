import { renderScreen } from '../../core/render.js'
import { goHome } from '../../state/ui.js'
import { InlineKeyboard } from 'grammy'
import { UserModel } from '../../models/User.js'
import { ADMIN_GROUP_ID, REGISTRATION_THREAD_ID } from '../../config/env.js'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export async function sendRegistrationAdminNotification(ctx: any, userId: number) {
  if (!ADMIN_GROUP_ID || !REGISTRATION_THREAD_ID) {
    throw new Error('ADMIN_GROUP_ID or REGISTRATION_THREAD_ID is not configured')
  }

  const profile = await UserModel.findOne({ telegramId: userId })
  if (!profile) throw new Error(`Registered user ${userId} was not found`)

  const username = String(profile.username || ctx.from?.username || '').replace(/^@/, '')
  const text = [
    '🆕 <b>НОВАЯ РЕГИСТРАЦИЯ</b>',
    '',
    `👤 <b>ФИО:</b> ${escapeHtml(profile.fio || '—')}`,
    `🏙 <b>Город:</b> ${escapeHtml(profile.city || '—')}`,
    `⛪ <b>Церковь:</b> ${escapeHtml(profile.church || '—')}`,
    '',
    `<b>Username:</b> ${username ? `@${escapeHtml(username)}` : '—'}`,
    `<b>Telegram ID:</b> <code>${userId}</code>`,
  ].join('\n')

  await ctx.api.sendMessage(ADMIN_GROUP_ID, text, {
    parse_mode: 'HTML',
    message_thread_id: REGISTRATION_THREAD_ID,
    reply_markup: new InlineKeyboard().url('Написать пользователю', `tg://user?id=${userId}`),
  })
}

export async function finishRegistration(ctx: any, userId: number) {
  await ctx.api.sendMessage(
    userId,
    `🎉 *Регистрация завершена!*

Добро пожаловать в ХАБ!

Теперь вы можете:

- 👥 Создавать команды
- 📦 Приобретать подписки
- 🤝 Вступать в существующие команды

Приятного использования!`,
    {
      parse_mode: 'Markdown',
    }
  )

  goHome(userId)

  await renderScreen(ctx, userId, 'main', undefined, {
    forceNew: true,
  })
}
