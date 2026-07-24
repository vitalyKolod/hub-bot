export const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || []

export function isAdmin(userId: number) {
  return ADMIN_IDS.includes(userId)
}
