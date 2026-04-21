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

  PAYMENT_USDT: 'TMFTta1wyguMMr8gHn8hxVbTYGSWoLuzma',
  PAYMENT_USDT_ERC20: '0x4b88017585132400e1afebeb8d1a3e522ebe7d5a',
  PAYMENT_TON: 'UQBAQvGg6hJiGPkQsysC3ZrkuqFcC2-B7vX4D4MGHAjK_vOZ',
  PAYMENT_BYBIT: '210547658',

  PRICE_CONTENT: '500₽',
  PRICE_PROPRESENTER: '1000₽',

  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID || '0'),

  RUB_PAYMENT: {
    card: {
      mastercard: '5536 9141 0822 8812',
      mir: {
        'Т-Банк': '2200 1234 5678 9012',
        Озон: '2200 9876 5432 1011',
        'Альфа-Банк': '2200 5555 6666 7777',
      },
    },
    sbp: {
      phone: '+7(924) 370 92-91', // номер один для всех
      banks: ['Т-Банк', 'Озон', 'Альфа-Банк'],
    },
  },
} as const
