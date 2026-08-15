import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { UserModel } from '../models/User.js'
import { TeamModel } from '../models/Team.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'

dotenv.config()

const DRY_RUN = process.argv.includes('--dry-run')

// старый ключ подписки -> новый productId в Team.subscriptions
const PRODUCT_MAP: Record<string, string> = {
  propresenter: 'propresenter',
  content: 'procontent',
  sunday: 'sunday_screens',
}

// статусы, которые вообще переносим (остальное — 'none'/'draft' — пропускаем)
const CARRY_STATUSES = new Set(['active', 'pending', 'expired'])

type RawVolunteer = { telegramId: number; fio?: string }

type RawUser = {
  telegramId: number
  fio?: string
  church?: string
  subscriptions?: {
    propresenter?: {
      status?: string
      flow?: number
      email?: string
      password?: string
      expiresAt?: string | Date
    }
    content?: {
      status?: string
      extraUsers?: number
      expiresAt?: string | Date
    }
    sunday?: {
      status?: string
    }
    volunteers?: RawVolunteer[]
  }
  isVolunteer?: boolean
  volunteer?: { ownerId?: number }
}

function log(...args: any[]) {
  console.log(...args)
}

function backupFile(name: string) {
  const dir = path.join(process.cwd(), 'migration-backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(dir, `${stamp}_${name}.json`)
}

async function migrate() {
  const mongoUri = process.env.MONGO_URI
  if (!mongoUri) {
    console.error('❌ MONGO_URI не задан в .env')
    process.exit(1)
  }

  await mongoose.connect(mongoUri)
  log('✅ Подключено к MongoDB')
  log(DRY_RUN ? '🧪 РЕЖИМ: DRY RUN (ничего не пишем)' : '🔥 РЕЖИМ: РЕАЛЬНАЯ ЗАПИСЬ')

  // ============================================================
  // 0. БЭКАП существующих команд перед записью
  // ============================================================
  if (!DRY_RUN) {
    const existingTeams = await TeamModel.find().lean()
    const file = backupFile('teams-before-migration')
    fs.writeFileSync(file, JSON.stringify(existingTeams, null, 2))
    log(`💾 Бэкап текущих команд (${existingTeams.length} шт.) сохранён: ${file}`)
  }

  // ============================================================
  // 1. Читаем ВСЕХ юзеров raw (.lean()!), т.к. в текущей схеме
  //    User.ts поля subscriptions/isVolunteer/volunteer больше не объявлены —
  //    без .lean() легко словить недостающие поля при гидратации в Mongoose.
  // ============================================================
  const allUsers = (await UserModel.find({}).lean()) as unknown as RawUser[]
  log(`🔍 Всего юзеров в базе: ${allUsers.length}`)

  const byTelegramId = new Map<number, RawUser>()
  for (const u of allUsers) byTelegramId.set(u.telegramId, u)

  // ============================================================
  // 2. Определяем кандидатов-владельцев:
  //    - есть хотя бы одна своя подписка в статусе active/pending/expired
  //    - ИЛИ у него есть волонтёры (значит он управляет командой,
  //      даже если его личная подписка сейчас неактивна)
  // ============================================================
  function hasOwnSubscription(u: RawUser): boolean {
    const s = u.subscriptions
    if (!s) return false
    return (
      CARRY_STATUSES.has(s.propresenter?.status || '') ||
      CARRY_STATUSES.has(s.content?.status || '') ||
      CARRY_STATUSES.has(s.sunday?.status || '')
    )
  }

  const candidateOwners = allUsers.filter((u) => {
    const volunteers = u.subscriptions?.volunteers || []
    return hasOwnSubscription(u) || volunteers.length > 0
  })

  log(`👑 Кандидатов в владельцы команд: ${candidateOwners.length}`)

  // ============================================================
  // 3. Список 'draft' и прочих неизвестных статусов — на ручную проверку
  // ============================================================
  const weirdStatuses = allUsers.filter(
    (u) =>
      (u.subscriptions?.content?.status &&
        !CARRY_STATUSES.has(u.subscriptions.content.status) &&
        u.subscriptions.content.status !== 'none') ||
      (u.subscriptions?.propresenter?.status &&
        !CARRY_STATUSES.has(u.subscriptions.propresenter.status) &&
        u.subscriptions.propresenter.status !== 'none')
  )
  if (weirdStatuses.length > 0) {
    log(
      `\n⚠️  Юзеры со статусом вне (active/pending/expired/none) — НЕ мигрированы, проверь руками:`
    )
    for (const u of weirdStatuses) {
      log(
        `   - ${u.telegramId} (${u.fio}) content=${u.subscriptions?.content?.status} propresenter=${u.subscriptions?.propresenter?.status}`
      )
    }
  }

  // ============================================================
  // 4. Основной цикл миграции
  // ============================================================
  let teamsCreated = 0
  let teamsUpdated = 0
  let teamsSkippedFully = 0
  let membersAdded = 0
  let subsCreated = 0
  let subsSkippedExisting = 0
  let errors = 0

  for (const owner of candidateOwners) {
    try {
      const teamName = owner.church?.trim() || `Команда ${owner.fio || owner.telegramId}`
      let team = await TeamModel.findOne({ ownerId: owner.telegramId })
      const isNewTeam = !team

      if (!team) {
        log(
          `\n🆕 [${DRY_RUN ? 'PLAN' : 'CREATE'}] Команда "${teamName}" для ${owner.fio || owner.telegramId}`
        )
        if (!DRY_RUN) {
          team = await TeamModel.create({
            name: teamName,
            ownerId: owner.telegramId,
            members: [{ telegramId: owner.telegramId, role: 'owner', status: 'active' }],
            subscriptions: new Map(),
          })
        }
        teamsCreated++
      } else {
        log(
          `\n♻️  [EXISTS] Команда "${team.name}" (owner ${owner.telegramId}) уже есть, докатываем недостающее`
        )
      }

      // ---- участники: волонтёры ----
      // Считаем текущий состав команды независимо от DRY_RUN: если team ещё
      // не создана физически (dry-run для новой команды), эффективный состав —
      // это просто [owner]. Это даёт dry-run отчёту верно предсказывать реальный запуск.
      const volunteers = owner.subscriptions?.volunteers || []
      const currentMemberIds = new Set<number>(
        team ? team.members.map((m: any) => m.telegramId) : [owner.telegramId]
      )

      for (const v of volunteers) {
        if (!v.telegramId) continue
        if (currentMemberIds.has(v.telegramId)) continue

        log(`   ➕ [${DRY_RUN ? 'PLAN' : 'ADD'}] волонтёр ${v.fio || v.telegramId} -> в команду`)
        currentMemberIds.add(v.telegramId)

        if (!DRY_RUN && team) {
          team.members.push({ telegramId: v.telegramId, role: 'member', status: 'active' } as any)
        }
        membersAdded++
      }

      // ---- подписки: propresenter / content / sunday ----
      const s = owner.subscriptions
      const toApply: Array<{ old: 'propresenter' | 'content' | 'sunday'; productId: string }> = [
        { old: 'propresenter', productId: PRODUCT_MAP.propresenter },
        { old: 'content', productId: PRODUCT_MAP.content },
        { old: 'sunday', productId: PRODUCT_MAP.sunday },
      ]

      for (const { old, productId } of toApply) {
        const src = (s as any)?.[old]
        const status = src?.status
        if (!status || !CARRY_STATUSES.has(status)) continue // none/draft/undefined — пропуск

        const existingSub = team?.subscriptions?.get(productId)
        if (existingSub && existingSub.status && existingSub.status !== 'none') {
          log(
            `   ⏭️  [SKIP] ${productId} — у команды уже есть подписка (status=${existingSub.status}), не трогаю`
          )
          subsSkippedExisting++
          continue
        }

        let meta: any = {}
        if (old === 'propresenter') {
          const flowNumber = src.flow ? Number(src.flow) : undefined
          let chatLink: string | undefined
          if (flowNumber) {
            const stream = await ProPresenterStreamModel.findOne({ flowNumber })
            chatLink = stream?.chatLink
            if (!stream) {
              log(
                `   ⚠️  Поток №${flowNumber} не найден в ProPresenterStreamModel (chatLink не заполнен)`
              )
            }
          }
          meta = {
            flowNumber: flowNumber || null,
            email: src.email || null,
            password: src.password || null,
            chatLink: chatLink || null,
          }
        }
        if (old === 'content' && src.extraUsers) {
          meta = { extraUsers: Number(src.extraUsers) }
        }

        log(
          `   💳 [${DRY_RUN ? 'PLAN' : 'SET'}] ${productId}: status=${status}, expiresAt=${src.expiresAt || '-'}`
        )

        if (!DRY_RUN && team) {
          team.subscriptions.set(productId, {
            status,
            expiresAt: src.expiresAt || null,
            meta,
          } as any)
        }
        subsCreated++
      }

      if (!DRY_RUN && team) {
        await team.save()
      }

      if (!isNewTeam) teamsUpdated++
    } catch (err) {
      console.error(`🔥 Ошибка миграции владельца ${owner.telegramId}:`, err)
      errors++
    }
  }

  // ============================================================
  // 5. Итоги
  // ============================================================
  log(`\n🎉 Миграция ${DRY_RUN ? '(dry-run) ' : ''}завершена.`)
  log(`   Команд создано: ${teamsCreated}`)
  log(`   Команд докатано (уже существовали): ${teamsUpdated}`)
  log(`   Участников добавлено: ${membersAdded}`)
  log(`   Подписок перенесено: ${subsCreated}`)
  log(`   Подписок пропущено (уже были): ${subsSkippedExisting}`)
  log(`   'draft'/неизвестных статусов на ручную проверку: ${weirdStatuses.length}`)
  log(`   Ошибок: ${errors}`)

  if (DRY_RUN) {
    log(
      `\n👉 Это был dry-run, в базу ничего не записано. Прогони без --dry-run, когда всё устроит.`
    )
  }

  await mongoose.disconnect()
  process.exit(0)
}

migrate().catch((err) => {
  console.error('🔥 Критическая ошибка миграции:', err)
  process.exit(1)
})
