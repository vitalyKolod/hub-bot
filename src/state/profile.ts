export type RegStep =
  | 'fio'
  | 'city'
  | 'church'
  | 'has_prop'
  | 'prop_stream_no'
  | 'prop_end_date'
  | 'has_screens'
  | 'screens_end_date'
  | 'done'

export type UserProfile = {
  userId: number

  // базовые данные
  fio?: string
  city?: string
  church?: string

  // подписка ProPresenter (поток)
  hasProPresenter?: boolean
  proStreamNo?: number
  proEndDate?: string // ISO date string (YYYY-MM-DD or full ISO)
  proDaysLeft?: number // вычисляем и кешируем для UI (не обязательно, но удобно)

  // подписка "Контент для экранов"
  hasScreens?: boolean
  screensEndDate?: string
  screensDaysLeft?: number

  // регистрация
  reg: 'new' | 'in_progress' | 'done'
  regStep: RegStep

  regPromptMessageId?: number
}

const store = new Map<number, UserProfile>()

export function getProfile(userId: number): UserProfile {
  const existing = store.get(userId)
  if (existing) return existing

  const created: UserProfile = {
    userId,
    reg: 'new',
    regStep: 'fio',
  }
  store.set(userId, created)
  return created
}

export function updateProfile(userId: number, patch: Partial<UserProfile>): UserProfile {
  const p = getProfile(userId)
  const updated = { ...p, ...patch }
  store.set(userId, updated)
  return updated
}

export function resetRegistration(userId: number) {
  const p = getProfile(userId)
  p.reg = 'new'
  p.regStep = 'fio'
  store.set(userId, p)
}

/**
 * Парсим дату вида "2026-12-31" (или любую, которую Date поймёт),
 * нормализуем в ISO (YYYY-MM-DD) и возвращаем daysLeft от today.
 */
export function computeDaysLeft(input: string): { iso: string; daysLeft: number } | null {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null

  // нормализация в YYYY-MM-DD
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const iso = `${yyyy}-${mm}-${dd}`

  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const t1 = new Date(yyyy, d.getMonth(), d.getDate()).getTime()

  const diff = t1 - t0
  const daysLeft = diff <= 0 ? 0 : Math.floor(diff / (1000 * 60 * 60 * 24))

  return { iso, daysLeft }
}
