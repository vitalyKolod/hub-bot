import 'dotenv/config'
import { connectDB } from './db.js'
import { startApiServer } from './src/api/server.js'

async function start() {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) throw new Error('BOT_TOKEN не задан')
  await connectDB()
  const { default: mongoose } = await import('mongoose')
  await Promise.all(Object.values(mongoose.models).map(model => model.init()))
  const server = startApiServer({
    botToken,
    port: Number(process.env.API_PORT || 3001),
    host: process.env.API_HOST || '127.0.0.1',
    allowedOrigins: (process.env.API_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
  })
  const shutdown = () => {
    server.close(async () => {
      const { default: mongoose } = await import('mongoose')
      await mongoose.disconnect()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

start().catch((error) => {
  console.error('API start failed:', error)
  process.exit(1)
})
