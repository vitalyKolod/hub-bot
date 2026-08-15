export const INPUT_MODES = {
  CREATE_TEAM: 'create_team',
  RENAME_TEAM: 'rename_team',
  SUPPORT: 'support',
} as const

export type InputMode = (typeof INPUT_MODES)[keyof typeof INPUT_MODES]
