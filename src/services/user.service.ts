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

export async function updateUser(telegramId: number, data: any) {
  return UserModel.updateOne({ telegramId }, { $set: data })
}
