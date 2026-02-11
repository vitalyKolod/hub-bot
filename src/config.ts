// src/config.ts
import 'dotenv/config'

if (!process.env.BOT_TOKEN) {
  console.error('Ошибка: BOT_TOKEN не найден в .env')
  process.exit(1)
}

if (!process.env.ADMIN_ID) {
  console.error('Ошибка: ADMIN_ID не найден в .env')
  process.exit(1)
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminId: Number(process.env.ADMIN_ID), // преобразуем в число
} as const
