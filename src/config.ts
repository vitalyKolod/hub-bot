import { RUB_PAYMENT, CRYPTO_WALLETS } from './config/payment.js'
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
  PAYMENT_RECEIVER_NAME: req('PAYMENT_RECEIVER_NAME'),

  PAYMENT_USDT: CRYPTO_WALLETS.trc20,
  PAYMENT_USDT_ERC20: CRYPTO_WALLETS.erc20,
  PAYMENT_TON: CRYPTO_WALLETS.ton,
  PAYMENT_BYBIT: CRYPTO_WALLETS.bybit,

  PRICE_CONTENT: '1000₽',
  PRICE_PROPRESENTER: '1000₽',

  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID || '0'),

  RUB_PAYMENT,
} as const
