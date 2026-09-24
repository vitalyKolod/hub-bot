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

  profile: {
    emoji: '👤',
    id: '5440764424820377609',
  },

  city: {
    emoji: '🏙',
    id: '5206244792253567745',
  },

  church: {
    emoji: '⛪',
    id: '5370857213533379300',
  },
} as const

export const PROFILE_ICONS = {
  profile: CUSTOM_EMOJIS.profile.id,
  city: CUSTOM_EMOJIS.city.id,
  church: CUSTOM_EMOJIS.church.id,
  teams: '5296533616224906961',
  team: '5258513401784573443',
} as const

export type CustomEmojiName = keyof typeof CUSTOM_EMOJIS

export const PAYMENT_ICONS = {
  payment: '5296320796300426938',
  newSubscription: '5895669571058142797',
  owner: '5433758796289685818',
  username: '5301222243043397156',
  id: '5014902839575577394',
  team: '5296533616224906961',
  confirm: '5301038027601098171',
} as const
