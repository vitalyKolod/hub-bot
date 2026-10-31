import 'dotenv/config'
import { spawn } from 'node:child_process'
import mongoose from 'mongoose'

const fail = (message) => { console.error(`[web] ${message}`); process.exit(1) }
if (process.env.NODE_ENV === 'production') fail('Локальный запуск недоступен в production.')
if (!process.env.MONGO_URI || !process.env.BOT_TOKEN) fail('Укажите MONGO_URI и BOT_TOKEN develop-бота в корневом .env.')
const userId = Number(process.env.WEB_DEV_USER_ID || process.env.ADMIN_ID || (process.env.ADMIN_IDS || '').split(',')[0])
if (!Number.isSafeInteger(userId) || userId <= 0) fail('Укажите ваш числовой Telegram ID в WEB_DEV_USER_ID в корневом .env.')
const apiPort = Number(process.env.API_PORT || 3001)
const webPort = Number(process.env.WEB_PORT || 3000)
if (![apiPort, webPort].every(port => Number.isInteger(port) && port > 0 && port < 65536) || apiPort === webPort) fail('API_PORT и WEB_PORT должны быть разными портами от 1 до 65535.')

try {
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 })
  const user = await mongoose.connection.db.collection('users').findOne({ telegramId: userId }, { projection: { username: 1, fio: 1 } })
  if (!user) throw new Error('HUB_USER_NOT_FOUND')
  console.log(`[web] Аккаунт: ${user.username ? `@${user.username}` : user.fio || userId} · Telegram ID ${userId}`)
} catch (error) {
  console.error(`[web] ${error?.message === 'HUB_USER_NOT_FOUND' ? 'Аккаунт не найден в настроенной базе. Проверьте WEB_DEV_USER_ID или сначала зарегистрируйтесь в develop-боте.' : 'Не удалось подключиться к настроенной базе develop-бота.'}`)
  process.exitCode = 1
} finally { await mongoose.disconnect() }
if (process.exitCode) process.exit(process.exitCode)

const children = []
let stopping = false
function signal(child, value) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value)
    else child.kill(value)
  } catch (error) { if (error?.code !== 'ESRCH') throw error }
}
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) signal(child, 'SIGTERM')
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) signal(child, 'SIGKILL')
    process.exit(code)
  }, 10_000)
  const finish = () => { if (children.every(child => child.exitCode !== null || child.signalCode !== null)) { clearTimeout(timer); process.exit(code) } }
  for (const child of children) child.once('exit', finish)
  finish()
}
function start(args, extraEnv) {
  const child = spawn('npm', args, { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development', ...extraEnv }, stdio: 'inherit', detached: process.platform !== 'win32' })
  children.push(child)
  child.on('error', () => { console.error('[web] Не удалось запустить npm.'); stop(1) })
  child.on('exit', (code) => { if (!stopping) stop(code || 1) })
}
start(['run', 'dev:api'], { API_HOST: '127.0.0.1', API_PORT: String(apiPort), ALLOW_DEV_AUTH: 'true', API_ALLOWED_ORIGINS: `http://localhost:${webPort},http://127.0.0.1:${webPort}` })
start(['--prefix', 'web', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(webPort)], {
  NEXT_PUBLIC_ALLOW_DEV_AUTH: 'true', NEXT_PUBLIC_DEV_AUTH_USER_ID: String(userId), NEXT_PUBLIC_HUB_DEMO: 'false', API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
})
process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
console.log(`[web] Develop: http://localhost:${webPort} · база и Telegram из корневого .env`)
console.log('[web] Действия сохраняются в develop-базе; уведомления отправляются настроенным develop-ботом. Бот отдельно: npm run dev.')
