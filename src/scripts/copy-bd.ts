// scripts/copy-db.ts
//
// Копирует ВСЕ коллекции из одной базы в другую — источник и назначение
// могут быть на РАЗНЫХ серверах (например, Atlas -> localhost).
// Без mongodump/mongorestore, просто читает и пишет через mongoose.
//
// Запуск:
//   SOURCE_URI="mongodb://...atlas.../test?ssl=true&..." \
//   TARGET_URI="mongodb://localhost:27017/test" \
//   bun run scripts/copy-db.ts

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

// ============================================================
// НАСТРОЙКИ
// ============================================================

// Источник — твой прод на Atlas, ПОЛНАЯ строка, обязательно с именем базы в конце
// (например .../test?ssl=true&...) — если не укажешь имя базы, попадёшь на
// дефолтную "test" от MongoDB, а не туда, куда думаешь.
const SOURCE_URI = process.env.SOURCE_URI

// Назначение — локальный MongoDB
const TARGET_URI = process.env.TARGET_URI || 'mongodb://localhost:27017/test'

// ============================================================

async function copyDatabase() {
  if (!SOURCE_URI) {
    console.error(
      '❌ Не задан SOURCE_URI — укажи полную строку подключения к проду (с именем базы!)'
    )
    process.exit(1)
  }

  const mask = (uri: string) => uri.replace(/:([^:@]+)@/, ':****@')

  console.log(`📥 Источник: ${mask(SOURCE_URI)}`)
  console.log(`📤 Назначение: ${mask(TARGET_URI)}`)

  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise()
  const targetConn = await mongoose.createConnection(TARGET_URI).asPromise()

  console.log(
    `✅ Подключились. Источник db="${sourceConn.name}", назначение db="${targetConn.name}"`
  )

  const collections = await sourceConn.db!.listCollections().toArray()
  console.log(`🔍 Найдено коллекций: ${collections.length}`)

  for (const { name } of collections) {
    const sourceCol = sourceConn.db!.collection(name)
    const targetCol = targetConn.db!.collection(name)

    const docs = await sourceCol.find({}).toArray()

    if (docs.length === 0) {
      console.log(`   ⏭️  ${name}: пусто, пропускаю`)
      continue
    }

    // чистим целевую коллекцию перед копированием — можно гонять скрипт
    // повторно и получать свежую копию, а не дубли
    await targetCol.deleteMany({})
    await targetCol.insertMany(docs)

    console.log(`   ✅ ${name}: скопировано ${docs.length} документов`)
  }

  await sourceConn.close()
  await targetConn.close()

  console.log(`\n🎉 Готово! "${targetConn.name}" на назначении — копия прода на момент запуска.`)
  process.exit(0)
}

copyDatabase().catch((err) => {
  console.error('🔥 Ошибка копирования:', err)
  process.exit(1)
})
