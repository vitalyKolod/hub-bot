// src/state/users.ts
import { DateTime } from 'luxon' // если хочешь удобные даты, иначе используй new Date()

// Тип пользователя — что храним о каждом
export interface User {
  telegramId: number // ID из Telegram
  joinDate: Date // Когда впервые зашёл /start
  subscriptionEnd?: Date // Когда заканчивается подписка (null если не оплачено)
  role?: 'user' | 'admin' | 'broadcaster' // Пока просто user, потом добавим
  lastActivity?: Date // Для будущих напоминаний
}

// Хранилище — простая Map в памяти (ключ: telegramId, значение: User)
const users = new Map<number, User>()

// Получить юзера по ID (или undefined, если нет)
export function getUser(telegramId: number): User | undefined {
  return users.get(telegramId)
}

// Создать или обновить юзера (при первом /start)
export function registerUser(telegramId: number): User {
  const existing = users.get(telegramId)
  if (existing) {
    existing.lastActivity = new Date()
    users.set(telegramId, existing)
    return existing
  }

  // Новый юзер
  const newUser: User = {
    telegramId,
    joinDate: new Date(),
    subscriptionEnd: undefined, // пока нет подписки
    role: 'user',
    lastActivity: new Date(),
  }

  users.set(telegramId, newUser)
  console.log(`Новый пользователь зарегистрирован: ${telegramId}`)
  return newUser
}

// Проверить, активна ли подписка
export function isSubscribed(user: User): boolean {
  if (!user.subscriptionEnd) return false
  return user.subscriptionEnd > new Date()
}

// Сколько дней осталось (целое число)
export function getRemainingDays(user: User): number {
  if (!user.subscriptionEnd) return 0
  const now = DateTime.now()
  const end = DateTime.fromJSDate(user.subscriptionEnd)
  const diff = end.diff(now, 'days').days
  return Math.max(0, Math.floor(diff))
}

// Для теста: вручную продлить подписку на год (потом админ будет делать)
export function extendSubscription(telegramId: number, days: number = 365) {
  const user = users.get(telegramId)
  if (!user) return

  const now = new Date()
  const end = new Date(now)
  end.setDate(now.getDate() + days)

  user.subscriptionEnd = end
  user.lastActivity = now
  users.set(telegramId, user)
  console.log(`Подписка продлена для ${telegramId} до ${end.toISOString()}`)
}

// Для отладки: вывести всех юзеров в консоль
export function debugUsers() {
  console.log('Текущие пользователи:')
  for (const [id, user] of users) {
    console.log(
      `ID: ${id}, Подписка до: ${user.subscriptionEnd?.toISOString() || 'нет'}, Роль: ${user.role}`
    )
  }
}

export default users // если нужно импортировать саму Map
