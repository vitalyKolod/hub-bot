import { goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { getOrCreateUser } from '../services/user.service.js'
import { UserModel } from '../models/User.js'
import { InlineKeyboard } from 'grammy'
import { escapeUnderscore } from '../utils/escape.js'

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

function computeDaysLeft(input: string) {
  const parts = input.split('.')
  if (parts.length !== 3) return null

  const [day, month, year] = parts.map(Number)

  const date = new Date(year, month - 1, day)

  if (isNaN(date.getTime())) return null

  const now = new Date()

  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return { date, daysLeft: diff }
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
      return header + '\nЕсть подписка ProPresenter? (да/нет)\nЕсли волонтер - ответьте нет'
    case 'prop_stream_no':
      return header + '\nВведите номер потока'
    case 'has_screens':
      return header + '\nЕсть подписка для экранов? (да/нет)\nЕсли волонтер - ответьте нет'
    case 'screens_end_date':
      return header + '\nВведите дату окончания в формате 28.06.2026'
    default:
      return header
  }
}

async function sendPrompt(ctx: any, userId: number, text: string) {
  await ctx.api.sendMessage(userId, text, { parse_mode: 'Markdown' })
}

// ---------------- START ----------------

export async function startRegistration(ctx: any, userId: number) {
  await UserModel.updateOne(
    { telegramId: userId },
    { reg: 'in_progress', regStep: 'fio', username: ctx.from?.username || 'нету' },
    { upsert: true }
  )

  const user = await getOrCreateUser(userId)
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
        return sendPrompt(ctx, userId, 'Введите правильное ФИО')
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
      if (!yn) return sendPrompt(ctx, userId, 'Ответьте, пожалуйста, да или нет')

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
          'subscriptions.propresenter.status': 'pending',
          regStep: 'has_screens',
        },
        { upsert: true }
      )
      break
    }

    case 'has_screens': {
      const yn = normalizeYesNo(answer)
      if (!yn) return sendPrompt(ctx, userId, 'Ответьте, пожалуйста, да или нет')

      await UserModel.updateOne(
        { telegramId: userId },
        {
          'subscriptions.content.status': yn === 'yes' ? 'draft' : 'none',
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
          'subscriptions.content.status': 'pending',
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
  const user = await getOrCreateUser(userId)
  const usernameText = ctx.from.username ? '@' + escapeUnderscore(ctx.from.username) : 'не указано'

  let text = `
🆕 *НОВАЯ РЕГИСТРАЦИЯ*

👤 ${user.fio || 'не указано'}
😎 ${usernameText}
🆔 ID: ${userId}
🌍 ${user.city || '-'}
⛪ ${user.church || '-'}
`

  // --- ProPresenter ---
  if (user.subscriptions?.propresenter?.status === 'pending') {
    text += `
🟧 *ProPresenter*
Поток: №${user.subscriptions.propresenter.flow}
`
  }

  // --- Контент ---
  if (user.subscriptions?.content?.status === 'pending') {
    text += `
🟪 *Контент для экранов*
До: ${user.subscriptions.content.expiresAt?.toLocaleDateString('ru-RU')}
`
  }

  text += `
Проверь данные и подтверди
`

  const { ADMIN_GROUP_ID } = process.env

  const kb = buildAdminKeyboard(user, userId)

  await ctx.api.sendMessage(Number(ADMIN_GROUP_ID), text, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  })

  // кнопки динамически

  // юзеру
  await ctx.api.sendMessage(
    userId,
    `✅ *Регистрация завершена!*

⏳ Ваши данные отправлены на проверку администратору.

После подтверждения вы получите уведомление.`,
    { parse_mode: 'Markdown' }
  )
  await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })

  goHome(userId)
  await renderScreen(ctx, userId, 'main')
}

export function buildAdminKeyboard(user: any, userId: number) {
  const kb = new InlineKeyboard()

  if (user.subscriptions?.propresenter?.status === 'pending') {
    kb.text('✅ Принять ProPresenter', `verify:prop:${userId}`).row()
  }

  if (user.subscriptions?.content?.status === 'pending') {
    kb.text('✅ Принять Контент', `verify:content:${userId}`).row()
  }

  kb.text('❌ Отклонить всё', `verify:reject:${userId}`)
    .row()
    .url('Написать юзеру', `tg://user?id=${userId}`)
    .icon('5258011929993026890')

  return kb
}
