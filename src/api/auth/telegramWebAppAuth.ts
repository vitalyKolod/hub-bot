import crypto from 'node:crypto'

const DEFAULT_MAX_AGE_SECONDS = 15 * 60

export type TelegramWebAppUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export type TelegramWebAppSession = {
  user: TelegramWebAppUser
  authDate: Date
  queryId?: string
}

export class TelegramWebAppAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramWebAppAuthError'
  }
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

/** Validates Telegram Mini App initData according to Telegram's HMAC scheme. */
export function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  options: { now?: Date; maxAgeSeconds?: number } = {}
): TelegramWebAppSession {
  if (!initData) throw new TelegramWebAppAuthError('Telegram initData is required')
  if (!botToken) throw new TelegramWebAppAuthError('Bot token is not configured')

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash') || ''
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (!timingSafeHexEqual(receivedHash, expectedHash)) {
    throw new TelegramWebAppAuthError('Telegram initData signature is invalid')
  }

  const authDateSeconds = Number(params.get('auth_date'))
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new TelegramWebAppAuthError('Telegram auth_date is invalid')
  }
  const nowSeconds = Math.floor((options.now || new Date()).getTime() / 1000)
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  if (authDateSeconds > nowSeconds + 30 || nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw new TelegramWebAppAuthError('Telegram initData has expired')
  }

  let user: TelegramWebAppUser
  try {
    user = JSON.parse(params.get('user') || '')
  } catch {
    throw new TelegramWebAppAuthError('Telegram user payload is invalid')
  }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || typeof user.first_name !== 'string') {
    throw new TelegramWebAppAuthError('Telegram user payload is invalid')
  }

  return {
    user,
    authDate: new Date(authDateSeconds * 1000),
    queryId: params.get('query_id') || undefined,
  }
}

export function readTelegramInitData(authorization: string | undefined): string {
  const match = authorization?.match(/^(?:tma|telegram)\s+(.+)$/i)
  if (!match) throw new TelegramWebAppAuthError('Telegram authorization is required')
  return match[1]
}
