import { notifyRegisteredUser } from '../../services/registrationNotification.service.js'
import { renderScreen } from '../../core/render.js'
import { goHome } from '../../state/ui.js'
import { InlineKeyboard } from 'grammy'
import { UserModel } from '../../models/User.js'
import { ADMIN_GROUP_ID } from '../../config/env.js'

export async function sendRegistrationAdminNotification(ctx: any, userId: number) {
  return notifyRegisteredUser(ctx.api, userId, ctx.from?.username)
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
  const profile = await UserModel.findOne({ telegramId: userId })
  if (profile?.pendingProPresenterRenewalId) {
    await UserModel.updateOne({ telegramId: userId }, { $set: { pendingProPresenterRenewalId: null } })
    const { showRenewalEntry } = await import('../../handlers/proPresenterRenewal.handlers.js')
    await showRenewalEntry(ctx, profile.pendingProPresenterRenewalId)
  }
}
