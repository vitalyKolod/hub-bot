import 'dotenv/config'
import { Bot } from 'grammy'
import { config } from './src/config.js'
import { registerHandlers } from './src/bot.js'
import { connectDB } from './db.js'

async function start() {
  try {
    console.log('Starting HUB bot...')

    // 1. Подключаем БД
    await connectDB()

    // 2. Создаём бота
    const bot = new Bot(config.BOT_TOKEN)

    // 3. Регистрируем хендлеры
    registerHandlers(bot)

    // 4. Ловим ошибки
    bot.catch((err) => {
      console.error('BOT ERROR:', err)
    })

    // 5. Запускаем
    await bot.start()

    console.log('✅ Bot started')
  } catch (err) {
    console.error('❌ Start failed:', err)
    process.exit(1)
  }
}

start()
