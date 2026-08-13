import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { PROP_FLOWS } from '../data/ProPresenterFLows.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'

dotenv.config()

async function migrate() {
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri) {
    console.error('❌ MONGO_URI не задан в .env')
    process.exit(1)
  }

  await mongoose.connect(mongoUri)
  console.log('✅ Подключено к MongoDB')

  let created = 0
  let skipped = 0

  for (const flow of PROP_FLOWS) {
    const existing = await ProPresenterStreamModel.findOne({ flowNumber: flow.flow })

    if (existing) {
      console.log(`⏭️  Поток №${flow.flow} уже существует, пропускаю`)
      skipped++
      continue
    }

    await ProPresenterStreamModel.create({
      flowNumber: flow.flow,
      email: flow.email,
      password: flow.password,
      chatLink: flow.chatFlow,
      capacity: 30,
      status: 'active',
      expiresAt: flow.expiresAt,
    })

    console.log(`✅ Поток №${flow.flow} создан`)
    created++
  }

  console.log(`\n🎉 Миграция завершена. Создано: ${created}, пропущено: ${skipped}`)

  await mongoose.disconnect()
  process.exit(0)
}

migrate().catch((err) => {
  console.error('🔥 Ошибка миграции:', err)
  process.exit(1)
})
