import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { UserModel } from '../models/User.js'
import { TeamModel } from '../models/Team.js'

dotenv.config()

const TEST_USER_ID = 1364109602
const VOLUNTEER_ID = 7985658733

async function migrateTest() {
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri) {
    console.error('❌ MONGO_URI не задан в .env')
    process.exit(1)
  }

  await mongoose.connect(mongoUri)

  console.log('✅ Подключено к MongoDB')
  console.log(`🧪 ТЕСТОВАЯ ПРОВЕРКА`)
  console.log(`👤 Владелец: ${TEST_USER_ID}`)
  console.log(`👤 Волонтёр: ${VOLUNTEER_ID}\n`)

  // ============================================================
  // USER
  // ============================================================

  const owner = await UserModel.findOne({
    telegramId: TEST_USER_ID,
  })

  if (!owner) {
    console.error('❌ Пользователь не найден')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log('👤 ПОЛЬЗОВАТЕЛЬ')
  console.log('────────────────────────')
  console.log('ID:', owner.telegramId)
  console.log('ФИО:', owner.fio)
  console.log('Церковь:', owner.church)
  console.log('isVolunteer:', owner.isVolunteer)

  // ============================================================
  // USER SUBSCRIPTIONS
  // ============================================================

  console.log('\n📦 ДАННЫЕ USER.SUBSCRIPTIONS')
  console.log('────────────────────────')

  console.dir(owner.subscriptions, {
    depth: null,
    colors: true,
  })

  // ============================================================
  // TEAM
  // ============================================================

  console.log('\n\n👥 КОМАНДЫ ВЛАДЕЛЬЦА')
  console.log('════════════════════════════════')

  const teams = await TeamModel.find({
    ownerId: TEST_USER_ID,
  })

  console.log(`Найдено команд: ${teams.length}`)

  for (const team of teams) {
    console.log('\n────────────────────────')
    console.log(`🏷️ Команда: ${team.name}`)
    console.log(`🆔 Team ID: ${team._id}`)
    console.log(`👑 Owner ID: ${team.ownerId}`)

    // ============================================================
    // MEMBERS
    // ============================================================

    console.log('\n👥 УЧАСТНИКИ:')

    console.dir(team.members, {
      depth: null,
      colors: true,
    })

    // ============================================================
    // SUBSCRIPTIONS
    // ============================================================

    console.log('\n📦 ПОДПИСКИ:')

    if (!team.subscriptions || team.subscriptions.size === 0) {
      console.log('Нет подписок')
    } else {
      console.dir(Object.fromEntries(team.subscriptions), {
        depth: null,
        colors: true,
      })
    }
  }

  // ============================================================
  // ВОЛОНТЁР
  // ============================================================

  console.log('\n\n👤 ВОЛОНТЁР')
  console.log('════════════════════════════════')

  const volunteer = await UserModel.findOne({
    telegramId: VOLUNTEER_ID,
  })

  if (!volunteer) {
    console.log('❌ Волонтёр не найден')
  } else {
    console.log('ID:', volunteer.telegramId)
    console.log('ФИО:', volunteer.fio)
    console.log('Церковь:', volunteer.church)
    console.log('isVolunteer:', volunteer.isVolunteer)

    console.log('\n📦 SUBSCRIPTIONS ВОЛОНТЁРА:')

    console.dir(volunteer.subscriptions, {
      depth: null,
      colors: true,
    })
  }

  // ============================================================
  // ПРОВЕРКА УЧАСТИЯ В КОМАНДЕ
  // ============================================================

  console.log('\n\n🔎 ПРОВЕРКА ВОЛОНТЁРА В КОМАНДАХ')
  console.log('════════════════════════════════')

  for (const team of teams) {
    const member = team.members.find((member) => member.telegramId === VOLUNTEER_ID)

    if (member) {
      console.log(`✅ Волонтёр ${VOLUNTEER_ID} найден в команде "${team.name}"`)

      console.dir(member, {
        depth: null,
        colors: true,
      })
    } else {
      console.log(`❌ Волонтёр ${VOLUNTEER_ID} НЕ найден в команде "${team.name}"`)
    }
  }

  // ============================================================
  // ИТОГ
  // ============================================================

  console.log('\n\n════════════════════════════════')
  console.log('🧪 DRY RUN / ПРОВЕРКА ЗАВЕРШЕНА')
  console.log('❗ НИЧЕГО В БД НЕ ИЗМЕНЕНО')
  console.log('════════════════════════════════\n')

  await mongoose.disconnect()
}

migrateTest().catch(async (err) => {
  console.error('🔥 Ошибка:', err)

  try {
    await mongoose.disconnect()
  } catch {}

  process.exit(1)
})
