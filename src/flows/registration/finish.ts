import { InlineKeyboard } from 'grammy'
import { UserModel } from '../../models/User.js'
import { renderScreen } from '../../core/render.js'
import { goHome } from '../../state/ui.js'
import { escapeUnderscore } from '../../utils/escape.js'

const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID)

export async function finishRegistration(ctx: any, userId: number) {
  await UserModel.updateOne(
    { telegramId: userId },
    {
      reg: 'done',
      regStep: 'done',
    }
  )

  const profile = await UserModel.findOne({ telegramId: userId })

  // 👇 уведомляем админа о новой регистрации — в основную тему (General), без message_thread_id
  if (ADMIN_GROUP_ID) {
    const usernameText = ctx.from?.username
      ? '@' + escapeUnderscore(ctx.from.username)
      : 'не указано'

    const adminText = `
🆕 *НОВАЯ РЕГИСТРАЦИЯ*
━━━━━━━━━━━━━━

👤 *ФИО:* ${profile?.fio || 'не указано'}
🏙 *Город:* ${profile?.city || 'не указано'}
⛪ *Церковь:* ${profile?.church || 'не указано'}
😎 *Юзернейм:* ${usernameText}
🆔 *ID:* \`${userId}\`

🕒 ${new Date().toLocaleString('ru-RU')}
`.trim()

    const kb = new InlineKeyboard().url('Написать юзеру', `tg://user?id=${userId}`)

    try {
      await ctx.api.sendMessage(ADMIN_GROUP_ID, adminText, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
    } catch (err) {
      console.error('Ошибка отправки уведомления о регистрации:', err)
    }
  }

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
