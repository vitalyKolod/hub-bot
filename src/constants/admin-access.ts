export const ADMIN_ROLE_META = {
  superadmin: {
    label: 'Суперадмин', title: 'СУПЕРАДМИН',
    addTitle: 'ДОБАВЛЕНИЕ СУПЕРАДМИНА', confirmTitle: 'ДОБАВИТЬ СУПЕРАДМИНА?',
    customEmojiId: '6129805886383723340', fallbackEmoji: '👑',
  },
  admin: {
    label: 'Администратор', title: 'АДМИНИСТРАТОР',
    addTitle: 'ДОБАВЛЕНИЕ АДМИНИСТРАТОРА', confirmTitle: 'ДОБАВИТЬ АДМИНИСТРАТОРА?',
    customEmojiId: '5203960621271363538', fallbackEmoji: '🛡️',
  },
  consultant: {
    label: 'Консультант', title: 'КОНСУЛЬТАНТ',
    addTitle: 'ДОБАВЛЕНИЕ КОНСУЛЬТАНТА', confirmTitle: 'ДОБАВИТЬ КОНСУЛЬТАНТА?',
    customEmojiId: '5391247205698912640', fallbackEmoji: '👁',
  },
} as const

export type AdminRole = keyof typeof ADMIN_ROLE_META

export const ADMIN_PERMISSION_META = {
  'users.view': { label: 'Просмотр пользователей', shortLabel: 'Просмотр', category: 'users' },
  'users.edit': { label: 'Редактирование пользователей', shortLabel: 'Редактирование', category: 'users' },
  'teams.view': { label: 'Просмотр команд', shortLabel: 'Просмотр', category: 'teams' },
  'teams.edit': { label: 'Редактирование команд', shortLabel: 'Редактирование', category: 'teams' },
  'subscriptions.view': { label: 'Просмотр подписок', shortLabel: 'Просмотр', category: 'subscriptions' },
  'subscriptions.edit': { label: 'Управление подписками', shortLabel: 'Управление', category: 'subscriptions' },
  'payments.view': { label: 'Просмотр платежей', shortLabel: 'Просмотр', category: 'payments' },
  'payments.manage': { label: 'Управление платежами', shortLabel: 'Управление', category: 'payments' },
  'streams.view': { label: 'Просмотр потоков', shortLabel: 'Просмотр', category: 'streams' },
  'streams.edit': { label: 'Редактирование потоков', shortLabel: 'Редактирование', category: 'streams' },
  'requests.view': { label: 'Просмотр заявок', shortLabel: 'Просмотр', category: 'requests' },
  'requests.edit': { label: 'Редактирование заявок', shortLabel: 'Редактирование', category: 'requests' },
  'support.view': { label: 'Просмотр поддержки', shortLabel: 'Просмотр', category: 'support' },
  'support.reply': { label: 'Ответы пользователям', shortLabel: 'Ответы', category: 'support' },
  'broadcasts.send': { label: 'Отправка рассылок', shortLabel: 'Отправка', category: 'broadcasts' },
  'tutorials.view': { label: 'Просмотр туториалов', shortLabel: 'Просмотр', category: 'tutorials' },
  'tutorials.edit': { label: 'Управление туториалами', shortLabel: 'Управление', category: 'tutorials' },
  'admins.view': { label: 'Просмотр администраторов', shortLabel: 'Просмотр', category: 'admins' },
  'admins.manage': { label: 'Управление администраторами', shortLabel: 'Управление', category: 'admins' },
} as const

export const ADMIN_PERMISSION_CATEGORIES = {
  users: { label: 'Пользователи', emoji: '👥' }, teams: { label: 'Команды', emoji: '🏠' },
  subscriptions: { label: 'Подписки', emoji: '📦' }, payments: { label: 'Платежи', emoji: '💳' },
  streams: { label: 'Потоки', emoji: '📡' }, requests: { label: 'Заявки', emoji: '📋' },
  support: { label: 'Поддержка', emoji: '💬' }, broadcasts: { label: 'Рассылки', emoji: '📣' },
  tutorials: { label: 'Туториалы', emoji: '🎬' },
  admins: { label: 'Администраторы', emoji: '👮' },
} as const

export type AdminPermissionKey = keyof typeof ADMIN_PERMISSION_META
export type AdminPermissionCategory = keyof typeof ADMIN_PERMISSION_CATEGORIES

export function getAdminRoleDisplay(role: AdminRole) { return ADMIN_ROLE_META[role] }
