import { UserModel } from '../models/User.js'

export async function getOrCreateUser(telegramId: number) {
  let user = await UserModel.findOne({ telegramId })

  if (!user) {
    user = await UserModel.create({
      telegramId,
      reg: 'none',
    })
  }

  return user
}

export async function activateContentSubscription(userId: number) {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1) // +1 год

  await UserModel.updateOne(
    { telegramId: userId },
    {
      'subscriptions.content.status': 'active',
      'subscriptions.content.expiresAt': expires,
    }
  )
}

export async function updateUser(telegramId: number, data: any) {
  return UserModel.updateOne({ telegramId }, { $set: data })
}
