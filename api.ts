import 'dotenv/config'
import { connectDB } from './db.js'
import { startApiServer } from './src/api/server.js'

async function start() {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) throw new Error('BOT_TOKEN не задан')
  await connectDB()
  startApiServer({
    botToken,
    port: Number(process.env.API_PORT || 3001),
    host: process.env.API_HOST || '0.0.0.0',
    allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
  })
}

start().catch((error) => {
  console.error('API start failed:', error)
  process.exit(1)
})
