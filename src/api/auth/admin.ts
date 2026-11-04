import { getAdminAccess } from '../../services/adminAccess.service.js'

export class AdminRequiredError extends Error {
  constructor() { super('Administrator access is required'); this.name = 'AdminRequiredError' }
}
/** Same active roles as Telegram, including database-managed administrators. */
export async function requireAdminUser(telegramId: number) {
  const access = await getAdminAccess(telegramId)
  if (!access) throw new AdminRequiredError()
  return access
}
