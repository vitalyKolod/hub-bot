import { Bot } from 'grammy'
import { config } from './src/config.js'
import { getMainMenu, mainMenuCaption, EXAMPLE_DAYS } from './src/keyboards.js'
import { InputFile } from 'grammy'

console.log('Запуск бота...')

const bot = new Bot(config.botToken)

bot.command('start', async (ctx) => {
  const caption = mainMenuCaption(EXAMPLE_DAYS)
  const keyboard = getMainMenu(EXAMPLE_DAYS)

  await ctx.replyWithPhoto(
    new InputFile('./public/calcilatorplus.png'), // ← InputFile + правильный путь
    {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  )
})

bot.on('message', (ctx) => ctx.reply('Got another message!'))

bot
  .start()
  .then(() => console.log('Bot started successfully'))
  .catch((err) => {
    console.error('Ошибка при запуске бота:', err)
    process.exit(1)
  })
