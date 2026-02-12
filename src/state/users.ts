// src/state/users.ts

export interface User {
  telegramId: number
  name?: string
  city?: string
  description?: string
  joinDate: Date
  subscriptionEnd?: Date
  role?: 'user' | 'admin' | 'broadcaster'
  lastActivity?: Date
}

const users = new Map<number, User>()

export function registerUser(telegramId: number, updates: Partial<User> = {}): User {
  let user = users.get(telegramId)

  if (!user) {
    user = {
      telegramId,
      joinDate: new Date(),
      subscriptionEnd: undefined,
      role: 'user',
      lastActivity: new Date(),
    }
  }

  Object.assign(user, updates)
  user.lastActivity = new Date()

  users.set(telegramId, user)
  console.log(`Юзер обновлён/создан: ${telegramId}`, user)
  return user
}

export function getRemainingDays(user: User): number {
  if (!user.subscriptionEnd) return 0

  const now = new Date().getTime()
  const end = user.subscriptionEnd.getTime()
  const diffMs = end - now

  if (diffMs <= 0) return 0

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function extendSubscription(telegramId: number, days: number = 365) {
  const user = users.get(telegramId)
  if (!user) return

  const startDate = new Date() // со дня оплаты/подтверждения
  const end = new Date(startDate)
  end.setDate(startDate.getDate() + days)

  user.subscriptionEnd = end
  user.lastActivity = startDate
  users.set(telegramId, user)
  console.log(`Подписка продлена для ${telegramId} до ${end.toISOString()}`)
}

export function debugUsers() {
  console.log('Текущие пользователи:')
  for (const [id, user] of users) {
    console.log(
      `ID: ${id}, Имя: ${user.name || 'нет'}, Город: ${user.city || 'нет'}, Подписка до: ${user.subscriptionEnd?.toISOString() || 'нет'}`
    )
  }
}

export default users
