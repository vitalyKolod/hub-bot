import { UserModel } from '../../models/User.js'
import { confirmationKeyboard } from './keyboards.js'
import { buildConfirmationMessage } from './questions.js'

export async function sendPrompt(ctx: any, userId: number, text: string) {
  const user = await UserModel.findOne({ telegramId: userId })

  if (user?.regStep === 'confirm_registration') {
    const message = await buildConfirmationMessage(userId)
    return ctx.api.sendMessage(userId, message.text, {
      entities: message.entities,
      reply_markup: confirmationKeyboard(),
    })
  }

  await ctx.api.sendMessage(userId, text, {
    parse_mode: 'Markdown',
  })
}
