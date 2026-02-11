// src/state/session.ts

export type SessionMode = 'waiting_check' | 'waiting_admin_message' | null

interface Session {
  mode: SessionMode
  data?: any // для будущих данных (например, payment_method: 'card' или 'crypto')
  timestamp: Date
}

const sessions = new Map<number, Session>() // ключ — userId

// Установить режим для юзера
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

// Получить текущий режим юзера
export function getSession(userId: number): Session | undefined {
  return sessions.get(userId)
}

// Очистить сессию (например, после /cancel или подтверждения)
export function clearSession(userId: number) {
  sessions.delete(userId)
}

// Автоочистка старых сессий (если юзер забыл, через 30 минут)
setInterval(() => {
  const now = Date.now()
  for (const [userId, session] of sessions.entries()) {
    if (now - session.timestamp.getTime() > 30 * 60 * 1000) {
      // 30 мин
      sessions.delete(userId)
    }
  }
}, 60 * 1000) // проверяем каждую минуту

export default sessions
