export const CUSTOM_EMOJIS = {
  smile: {
    emoji: '🙂',
    id: '5463249828450424568',
  },

  hub: {
    emoji: '🟢',
    id: '5379559474405092361',
  },

  start: {
    emoji: '🔵',
    id: '5470177992950946662',
  },
} as const

export type CustomEmojiName = keyof typeof CUSTOM_EMOJIS
