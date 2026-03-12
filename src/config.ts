import 'dotenv/config'

function req(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing env: ${name}`)
    process.exit(1)
  }
  return v
}

export const config = {
  BOT_TOKEN: req('BOT_TOKEN'),
  ADMIN_ID: Number(req('ADMIN_ID')),
  MONGO_URL: process.env.MONGO_URL || '',
  MEDIA_MODE: (process.env.MEDIA_MODE ?? 'photo') as 'photo' | 'text',

  PAYMENT_CARD: req('PAYMENT_CARD'),
  PAYMENT_SBP: req('PAYMENT_SBP'),
  PAYMENT_USDT: req('PAYMENT_USDT'),
  PAYMENT_RECEIVER_NAME: req('PAYMENT_RECEIVER_NAME'),

  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID || '0'),
} as const
