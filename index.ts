import 'dotenv/config'
import { Bot } from 'grammy'
import { config } from './src/config.js'
import { registerHandlers } from './src/bot.js'

console.log('Starting HUB bot...')

const bot = new Bot(config.BOT_TOKEN)

registerHandlers(bot)

bot.catch((err) => {
  console.error('BOT ERROR:', err)
})

bot
  .start()
  .then(() => console.log('Bot started'))
  .catch((err) => {
    console.error('Start failed:', err)
    process.exit(1)
  })
