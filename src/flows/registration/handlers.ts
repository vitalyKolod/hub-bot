import { UserModel } from '../../models/User.js'
import { getOrCreateUser } from '../../services/user.service.js'

import { buildQuestionText } from './questions.js'
import { sendPrompt } from './ui.js'

export async function startRegistration(ctx: any, userId: number) {
  await UserModel.updateOne(
    { telegramId: userId },
    { reg: 'in_progress', regStep: 'fio', username: ctx.from?.username || 'нету' },
    { upsert: true }
  )

  const user = await getOrCreateUser(userId)
  await sendPrompt(ctx, userId, await buildQuestionText(userId))
}

export async function handleRegistrationText(ctx: any, userId: number, text: string) {
  const user = await getOrCreateUser(userId)
  if (user.reg !== 'in_progress') return

  const answer = text.trim()

  switch (user.regStep) {
    case 'fio':
      if (answer.length < 3) {
        return sendPrompt(ctx, userId, 'Введите правильное ФИО')
      }

      await UserModel.updateOne(
        { telegramId: userId },
        { fio: answer, regStep: 'city' },
        { upsert: true }
      )

      return sendPrompt(ctx, userId, await buildQuestionText(userId))

    case 'city':
      await UserModel.updateOne(
        { telegramId: userId },
        { city: answer, regStep: 'church' },
        { upsert: true }
      )

      return sendPrompt(ctx, userId, await buildQuestionText(userId))

    case 'church':
      await UserModel.updateOne(
        { telegramId: userId },
        { church: answer, regStep: 'confirm_registration' },
        { upsert: true }
      )

      return sendPrompt(ctx, userId, await buildQuestionText(userId))
  }
}
