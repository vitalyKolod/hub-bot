// constants/admin-panel.ts
// Формат callback_data админ-панели: короткий плоский текст с префиксом "ap:",
// чтобы укладываться в лимит Telegram (64 байта на callback_data).

export const AP_PREFIX = 'ap:'

export function isAdminPanelCallback(data: string): boolean {
  return data.startsWith(AP_PREFIX)
}

export function parseAdminPanelCallback(data: string): string[] {
  return data.slice(AP_PREFIX.length).split(':')
}

export function apCb(...parts: (string | number)[]): string {
  const data = AP_PREFIX + parts.join(':')
  if (data.length > 64) {
    console.warn('⚠️ admin-panel callback_data превышает 64 байта:', data, data.length)
  }
  return data
}

// ---------- Продукты команды ----------
// Те же id, что в config/products.ts. 'other' и 'add_member' сюда не входят —
// это не подписки команды, а служебные/разовые позиции корзины.
export const TEAM_PRODUCT_IDS = [
  'propresenter',
  'procontent',
  'cmg',
  'sunday_screens',
  'cgs',
  'storyloops',
] as const

export const PRODUCT_EMOJI: Record<string, string> = {
  propresenter: '🎬',
  procontent: '🖥',
  cmg: '🎞',
  sunday_screens: '📽',
  cgs: '🏙',
  storyloops: '🔁',
}

// ---------- Статусы ----------

export const SUB_STATUSES = ['none', 'pending', 'active', 'expired', 'rejected'] as const

export const SUB_STATUS_LABELS: Record<string, string> = {
  none: '⚪️ Нет',
  pending: '🟡 На проверке',
  active: '🟢 Активна',
  expired: '🔴 Истекла',
  rejected: '❌ Отклонена',
}

export function statusLabel(status?: string | null): string {
  return SUB_STATUS_LABELS[status || 'none'] || status || '—'
}

export function statusDot(status?: string | null): string {
  switch (status) {
    case 'active':
      return '🟢'
    case 'pending':
      return '🟡'
    case 'expired':
      return '🔴'
    case 'rejected':
      return '❌'
    default:
      return '⚪️'
  }
}

export function formatDate(date?: Date | string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function getDaysLeft(date?: Date | string | null): number {
  if (!date) return 0
  const target = new Date(date)
  if (isNaN(target.getTime())) return 0
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diff = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

export const PAGE_SIZE = 15
