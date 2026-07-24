import { UserModel } from '../../models/User.js'
import { confirmationKeyboard } from './keyboards.js'

export async function sendPrompt(ctx: any, userId: number, text: string) {
  const user = await UserModel.findOne({ telegramId: userId })

  if (user?.regStep === 'confirm_registration') {
    return ctx.api.sendMessage(userId, text, {
      parse_mode: 'Markdown',
      reply_markup: confirmationKeyboard(),
    })
  }

  await ctx.api.sendMessage(userId, text, {
    parse_mode: 'Markdown',
  })
}
