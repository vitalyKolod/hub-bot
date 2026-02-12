import 'dotenv/config'
import { Bot } from 'grammy'
import { config } from './src/config.js'

import startHandler from './src/handlers/start.js'
import callbackHandler from './src/handlers/callback.js'

import messagesHandler from './src/handlers/messages.js'

// ... после других bot.use

console.log('Запуск бота...')

const bot = new Bot(config.botToken)

// Подключаем handlers
bot.use(startHandler)
bot.use(messagesHandler)
bot.use(callbackHandler)

// Глобальный catch ошибок (чтобы бот не падал)
bot.catch((err) => {
  console.error('Глобальная ошибка:', err)
})

bot
  .start()
  .then(() => console.log('Bot started successfully'))
  .catch((err) => {
    console.error('Ошибка запуска:', err)
    process.exit(1)
  })
