export const REGISTRATION_FIELDS = {
  fio: {
    label: 'ФИО',
    emoji: '👤',
    customEmojiId: '5258011929993026890',
  },
  city: {
    label: 'Город',
    emoji: '🏙',
    customEmojiId: '5453906530824903181',
  },
  church: {
    label: 'Церковь',
    emoji: '⛪',
    customEmojiId: '5370857213533379300',
  },
} as const

export type RegistrationField = keyof typeof REGISTRATION_FIELDS
