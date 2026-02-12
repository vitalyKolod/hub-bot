// src/state/session.ts

export type SessionMode =
  | 'waiting_check'
  | 'waiting_name'
  | 'waiting_fio'
  | 'waiting_city' // ждём имя
  | 'waiting_description' // ждём описание/роль
  | 'waiting_subscription_date' // ждём дату окончания подписки
  | 'waiting_admin_message' // если оставишь позже
  | null

interface Session {
  mode: SessionMode
  data?: any // можно хранить дополнительные данные (например, { paymentMethod: 'card' })
  timestamp: Date
}

const sessions = new Map<number, Session>() // ключ — userId (telegramId)

export function setSession(userId: number, mode: SessionMode, data?: any) {
  if (mode === null) {
    sessions.delete(userId)
    return
  }

  sessions.set(userId, {
    mode,
    data,
    timestamp: new Date(),
  })
}

export function getSession(userId: number): Session | undefined {
  return sessions.get(userId)
}

export function clearSession(userId: number) {
  sessions.delete(userId)
}

// Автоочистка старых сессий (30 минут бездействия)
setInterval(() => {
  const now = Date.now()
  for (const [userId, session] of sessions.entries()) {
    if (now - session.timestamp.getTime() > 30 * 60 * 1000) {
      sessions.delete(userId)
      console.log(`Сессия очищена для ${userId} (таймаут)`)
    }
  }
}, 60 * 1000) // проверяем каждую минуту

export default sessions
