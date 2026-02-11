// src/config.ts
import 'dotenv/config'

if (!process.env.BOT_TOKEN) {
  console.error('Ошибка: переменная BOT_TOKEN не найдена в .env файле')
  console.error('Создайте файл .env и добавьте туда:')
  console.error('BOT_TOKEN=ваш_токен_бота')
  process.exit(1)
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  // сюда позже добавим ADMIN_IDS, MONGODB_URI и т.д.
} as const
