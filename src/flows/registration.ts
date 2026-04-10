import { goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { getOrCreateUser } from '../services/user.service.js'
import { UserModel } from '../models/User.js'

// ---------------- UTILS ----------------

function stepTitle(step: string): string {
  switch (step) {
    case 'fio':
      return 'Шаг 1/6'
    case 'city':
      return 'Шаг 2/6'
    case 'church':
      return 'Шаг 3/6'
    case 'has_prop':
      return 'Шаг 4/6'
    case 'prop_stream_no':
      return 'Шаг 5/6'
    case 'prop_end_date':
      return 'Шаг 6/6'
    case 'has_screens':
      return 'Доп. шаг'
    case 'screens_end_date':
      return 'Доп. шаг'
    default:
      return 'Регистрация'
  }
}

function normalizeYesNo(input: string): 'yes' | 'no' | null {
  const t = input.trim().toLowerCase()
  if (['да', 'д', 'yes', 'y', '+', 'ага'].includes(t)) return 'yes'
  if (['нет', 'н', 'no', 'n', '-', 'неа'].includes(t)) return 'no'
  return null
}

function computeDaysLeft(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null

  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return { date: d, daysLeft: diff }
}

// ---------------- UI ----------------

async function buildQuestionText(userId: number): Promise<string> {
  const user = await UserModel.findOne({ telegramId: userId })
  if (!user) throw new Error('User not found')

  const header = `*📝 РЕГИСТРАЦИЯ* — _${stepTitle(user.regStep)}_\n`

  switch (user.regStep) {
    case 'fio':
      return header + '\nВведите *Имя и Фамилию*'
    case 'city':
      return header + '\nУкажите ваш *город*'
    case 'church':
      return header + '\nУкажите вашу *церковь*'
    case 'has_prop':
      return header + '\nЕсть подписка ProPresenter? (да/нет)\n Если волонтер - ответь нет'
    case 'prop_stream_no':
      return header + '\nВведите номер потока'
    case 'prop_end_date':
      return header + '\nВведите дату окончания (2026-12-31)'
    case 'has_screens':
      return header + '\nЕсть подписка для экранов? (да/нет)\n Если волонтер - ответь нет'
    case 'screens_end_date':
      return header + '\nВведите дату окончания'
    default:
      return header
  }
}

async function sendPrompt(ctx: any, userId: number, text: string) {
  await ctx.api.sendMessage(userId, text, { parse_mode: 'Markdown' })
}

// ---------------- START ----------------

export async function startRegistration(ctx: any, userId: number) {
  await UserModel.updateOne({ telegramId: userId }, { reg: 'in_progress', regStep: 'fio' })

  const user = await getOrCreateUser(userId) // 🔥 подтягиваем актуального юзера
  await sendPrompt(ctx, userId, await buildQuestionText(userId))
}

// ---------------- MAIN FLOW ----------------

export async function handleRegistrationText(ctx: any, userId: number, text: string) {
  const user = await getOrCreateUser(userId)
  if (user.reg !== 'in_progress') return

  const answer = text.trim()

  switch (user.regStep) {
    case 'fio':
      if (answer.length < 3) {
        return sendPrompt(ctx, userId, 'Введите норм ФИО')
      }

      await UserModel.updateOne(
        { telegramId: userId },
        { fio: answer, regStep: 'city' },
        { upsert: true }
      )
      break

    case 'city':
      await UserModel.updateOne(
        { telegramId: userId },
        { city: answer, regStep: 'church' },
        { upsert: true }
      )
      break

    case 'church':
      await UserModel.updateOne(
        { telegramId: userId },
        { church: answer, regStep: 'has_prop' },
        { upsert: true }
      )
      break

    case 'has_prop': {
      const yn = normalizeYesNo(answer)
      if (!yn) return sendPrompt(ctx, userId, 'Ответь да или нет')

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.propresenter.status': yn === 'yes' ? 'active' : 'none',
          regStep: yn === 'yes' ? 'prop_stream_no' : 'has_screens',
        },
        { upsert: true }
      )
      break
    }

    case 'prop_stream_no': {
      const n = Number(answer)
      if (!Number.isFinite(n) || n <= 0) {
        return sendPrompt(ctx, userId, 'Введите норм номер потока (например 12)')
      }

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.propresenter.flow': Math.floor(n),
          regStep: 'prop_end_date',
        },
        { upsert: true }
      )
      break
    }

    case 'prop_end_date': {
      const parsed = computeDaysLeft(answer)
      if (!parsed) return sendPrompt(ctx, userId, 'Неверная дата')

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.propresenter.expiresAt': parsed.date,
          regStep: 'has_screens',
        },
        { upsert: true }
      )
      break
    }

    case 'has_screens': {
      const yn = normalizeYesNo(answer)
      if (!yn) return sendPrompt(ctx, userId, 'Ответь да или нет')

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.content.status': yn === 'yes' ? 'active' : 'none',
          regStep: yn === 'yes' ? 'screens_end_date' : 'done',
          reg: yn === 'yes' ? 'in_progress' : 'done',
        },
        { upsert: true }
      )

      if (yn === 'no') {
        return finishRegistration(ctx, userId)
      }

      break
    }

    case 'screens_end_date': {
      const parsed = computeDaysLeft(answer)
      if (!parsed) return sendPrompt(ctx, userId, 'Неверная дата')

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.content.expiresAt': parsed.date,
          reg: 'done',
          regStep: 'done',
        },
        { upsert: true }
      )

      return finishRegistration(ctx, userId)
    }
  }

  const updatedUser = await getOrCreateUser(userId)
  await sendPrompt(ctx, userId, await buildQuestionText(userId))
}

// ---------------- FINISH ----------------

async function finishRegistration(ctx: any, userId: number) {
  await ctx.api.sendMessage(userId, '✅ Регистрация завершена')

  goHome(userId)
  await renderScreen(ctx, userId, 'main')
}
