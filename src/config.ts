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
  MONGO_URL: process.env.MONGO_URL || '', // подключим позже
} as const
