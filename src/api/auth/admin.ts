import { isAdmin } from '../../config/admin.js'

export class AdminRequiredError extends Error {
  constructor() {
    super('Administrator access is required')
    this.name = 'AdminRequiredError'
  }
}

export function requireAdminUser(telegramId: number): true {
  if (!isAdmin(telegramId)) throw new AdminRequiredError()
  return true
}
