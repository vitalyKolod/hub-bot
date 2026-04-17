import { UserModel } from '../models/User.js'
export async function getOrCreateUser(telegramId: number) {
  let user = await UserModel.findOne({ telegramId })

  if (!user) {
    user = await UserModel.create({
      telegramId,
      reg: 'none',
      regStep: 'fio',
      subscriptions: {
        propresenter: { status: 'none' },
        content: { status: 'none' },
      },
    })
  }

  return user
}

export async function updateUser(telegramId: number, data: any) {
  return UserModel.updateOne({ telegramId }, { $set: data })
}

export async function activateOrExtendContentSubscription(userId: number) {
  const user = await getOrCreateUser(userId)

  const now = new Date()
  const currentExpire = user.subscriptions?.content?.expiresAt

  // если подписки нет или истекла
  if (!currentExpire || new Date(currentExpire) < now) {
    const newExpire = new Date()
    newExpire.setFullYear(newExpire.getFullYear() + 1)

    await UserModel.updateOne(
      { telegramId: userId },
      {
        'subscriptions.content.status': 'active',
        'subscriptions.content.expiresAt': newExpire,
        reminders: [],
      }
    )

    return { type: 'activated', expiresAt: newExpire }
  }

  // если уже есть подписка → продление
  const newExpire = new Date(currentExpire)
  newExpire.setFullYear(newExpire.getFullYear() + 1)

  await UserModel.updateOne(
    { telegramId: userId },
    {
      'subscriptions.content.status': 'active',
      'subscriptions.content.expiresAt': newExpire,
      reminders: [],
    }
  )

  return { type: 'extended', expiresAt: newExpire }
}
