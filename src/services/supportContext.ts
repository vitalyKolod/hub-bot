import { getProduct } from '../config/products.js'

export const SUPPORT_CATEGORIES = {
  payment: '💳 Оплата', subscription: '📦 Подписка / доступ',
  team: '👥 Команда / волонтёры', propresenter: '📡 ProPresenter',
  yandex360: '✉️ Яндекс 360', hub: '⚙️ Работа HUB', other: '❓ Другое',
} as const
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES
export const SUPPORT_ISSUES: Record<SupportCategory, Record<string, string>> = {
  payment: { payment_rejected: '❌ Оплата отклонена', payment_failed: '💳 Не получается оплатить', payment_pending: '⏳ Чек долго на проверке', pricing: '💰 Вопрос по стоимости', payment_access: '🔐 Оплатил, но доступ не появился', other: '❓ Другое' },
  subscription: { no_access: '🚫 Нет доступа', no_invite: '🔗 Не пришла ссылка / приглашение', credentials: '🔑 Не работают данные для входа', renewal: '🔄 Продление', expiry: '📅 Срок подписки', other: '❓ Другое' },
  team: { add_member: '➕ Добавить волонтёра', join: '🚪 Не получается вступить', no_invite: '🔗 Не пришло приглашение', member: '👤 Проблема с участником', subscription: '📦 Проблема с подпиской команды', other: '❓ Другое' },
  propresenter: { stream: '📡 Проблема с потоком', credentials: '🔑 Не подходят данные для входа', request: '📝 Вопрос по заявке на поток', chat: '💬 Не работает чат / приглашение', renewal: '🔄 Продление', other: '❓ Другое' },
  yandex360: { add_email: '➕ Добавить email', change_email: '✏️ Изменить email', access: '🔐 Проблема с доступом', stream: '📅 Вопрос по потоку', other: '❓ Другое' },
  hub: { bot: '🤖 Бот работает неправильно', team: '👥 Проблема с командой', notifications: '🔔 Не приходят уведомления', interface: '📱 Проблема с интерфейсом', other: '❓ Другое' },
  other: {},
}
export type SupportMetadata = {
  category?: SupportCategory
  subcategory?: string
  source?: 'support_menu' | 'payment_rejection'
  paymentId?: string
  teamId?: string
  productIds?: string[]
}
export type SupportDraft = {
  step: 'categories' | 'issues' | 'teams' | 'payments' | 'subscriptions' | 'products' | 'message'
  metadata: SupportMetadata
  history: Array<{ step: SupportDraft['step']; metadata: SupportMetadata }>
  options?: Array<{ id: string; label: string }>
  page?: number
  messageId?: number
}
export function productTitle(id: string, savedTitle?: string) {
  return getProduct(id)?.name || savedTitle || id || 'Продукт не указан'
}
export function paymentLabel(payment: any) {
  const statuses: Record<string, string> = { pending: '🟡 На проверке', processing: '🟡 На проверке', accepted: '✅ Подтверждено', rejected: '❌ Отклонено' }
  return `${productTitle(payment.productId, payment.productTitle || payment.productName)} · ${payment.amount ?? '—'} ${payment.currency === 'usd' ? '$' : '₽'} · ${statuses[payment.status] || 'Статус не указан'}`
}
export function supportContextText(metadata: SupportMetadata, payment?: any, team?: any) {
  const category = metadata.category
  return [
    category ? `Тема: ${SUPPORT_CATEGORIES[category] || 'Другое'}` : null,
    category && metadata.subcategory ? `Причина: ${SUPPORT_ISSUES[category]?.[metadata.subcategory] || 'Другое'}` : null,
    metadata.teamId ? `Команда: ${team?.name || 'Команда недоступна'}` : null,
    metadata.productIds?.length ? `Подписки / продукты:\n${metadata.productIds.map(id => `• ${productTitle(id)}`).join('\n')}` : null,
    metadata.paymentId ? `Оплата:\n${payment ? paymentLabel(payment) : 'Платёж недоступен'}` : null,
    payment?.rejectionReason ? `Причина отклонения:\n${payment.rejectionReason}` : null,
  ].filter(Boolean).join('\n\n')
}
