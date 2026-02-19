import { getProfile, updateProfile, computeDaysLeft } from '../state/profile.js'
import { goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'

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

function buildQuestionText(userId: number): string {
  const p = getProfile(userId)

  const header = `*📝 РЕГИСТРАЦИЯ* — _${stepTitle(p.regStep)}_\n`

  switch (p.regStep) {
    case 'fio':
      return header + '\nВведите *Имя и Фамилию* (отчество необязательно).\n\nПример: `Иван Петров`'
    case 'city':
      return header + '\nУкажите ваш *город*:'
    case 'church':
      return header + '\nУкажите вашу *церковь*:'
    case 'has_prop':
      return (
        header + '\nУ вас уже есть действующая подписка *ProPresenter*?\n\nОтветьте: `да` или `нет`'
      )
    case 'prop_stream_no':
      return header + '\nВведите *номер потока* ProPresenter.\n\nПример: `12`'
    case 'prop_end_date':
      return header + '\nДо какого числа оплачена подписка ProPresenter?\n\nФормат: `2026-12-31`'
    case 'has_screens':
      return header + '\nУ вас есть подписка *Контент для экранов*?\n\nОтветьте: `да` или `нет`'
    case 'screens_end_date':
      return (
        header +
        '\nДо какого числа оплачена подписка “Контент для экранов”?\n\nФормат: `2026-12-31`'
      )
    default:
      return header + '\nРегистрация…'
  }
}

async function sendOrEditPrompt(ctx: any, userId: number, text: string) {
  const p = getProfile(userId)

  // Если сообщение-вопрос уже есть — редактируем его
  if (p.regPromptMessageId) {
    try {
      await ctx.api.sendMessage(userId, p.regPromptMessageId, text, {
        parse_mode: 'Markdown',
      })
      return
    } catch (e) {
      // Если не смогли отредактировать (удалили/не найдено) — создадим заново
    }
  }

  const msg = await ctx.api.sendMessage(userId, text, { parse_mode: 'Markdown' })
  updateProfile(userId, { regPromptMessageId: msg.message_id })
}

function normalizeYesNo(input: string): 'yes' | 'no' | null {
  const t = input.trim().toLowerCase()
  if (['да', 'д', 'yes', 'y', '+', 'ага'].includes(t)) return 'yes'
  if (['нет', 'н', 'no', 'n', '-', 'неа'].includes(t)) return 'no'
  return null
}

export async function startRegistration(ctx: any, userId: number) {
  updateProfile(userId, { reg: 'in_progress', regStep: 'fio' })
  await sendOrEditPrompt(ctx, userId, buildQuestionText(userId))
}

/**
 * Вызывается на каждое текстовое сообщение пользователя во время регистрации
 */
export async function handleRegistrationText(ctx: any, userId: number, text: string) {
  const p = getProfile(userId)
  if (p.reg !== 'in_progress') return

  const answer = text.trim()

  switch (p.regStep) {
    case 'fio':
      if (answer.length < 3) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Введите ФИО текстом.'
        )
        return
      }
      updateProfile(userId, { fio: answer, regStep: 'city' })
      break

    case 'city':
      if (answer.length < 2) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Город не может быть пустым.'
        )
        return
      }
      updateProfile(userId, { city: answer, regStep: 'church' })
      break

    case 'church':
      if (answer.length < 2) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Церковь не может быть пустой.'
        )
        return
      }
      updateProfile(userId, { church: answer, regStep: 'has_prop' })
      break

    case 'has_prop': {
      const yn = normalizeYesNo(answer)
      if (!yn) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Ответьте строго: `да` или `нет`'
        )
        return
      }
      if (yn === 'yes') {
        updateProfile(userId, { hasProPresenter: true, regStep: 'prop_stream_no' })
      } else {
        updateProfile(userId, { hasProPresenter: false, regStep: 'has_screens' })
      }
      break
    }

    case 'prop_stream_no': {
      const n = Number(answer)
      if (!Number.isFinite(n) || n <= 0) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Введите номер потока числом, например: `12`'
        )
        return
      }
      updateProfile(userId, { proStreamNo: Math.floor(n), regStep: 'prop_end_date' })
      break
    }

    case 'prop_end_date': {
      const parsed = computeDaysLeft(answer)
      if (!parsed) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Неверный формат даты. Пример: `2026-12-31`'
        )
        return
      }
      updateProfile(userId, {
        proEndDate: parsed.iso,
        proDaysLeft: parsed.daysLeft,
        regStep: 'has_screens',
      })
      break
    }

    case 'has_screens': {
      const yn = normalizeYesNo(answer)
      if (!yn) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Ответьте строго: `да` или `нет`'
        )
        return
      }
      if (yn === 'yes') {
        updateProfile(userId, { hasScreens: true, regStep: 'screens_end_date' })
      } else {
        // регистрация завершена
        updateProfile(userId, { hasScreens: false, reg: 'done', regStep: 'done' })
        await finishRegistration(ctx, userId)
        return
      }
      break
    }

    case 'screens_end_date': {
      const parsed = computeDaysLeft(answer)
      if (!parsed) {
        await sendOrEditPrompt(
          ctx,
          userId,
          buildQuestionText(userId) + '\n\n⚠️ Неверный формат даты. Пример: `2026-12-31`'
        )
        return
      }

      updateProfile(userId, {
        screensEndDate: parsed.iso,
        screensDaysLeft: parsed.daysLeft,
        reg: 'done',
        regStep: 'done',
      })
      await finishRegistration(ctx, userId)
      return
    }

    default:
      // если что-то странное — рестарт
      updateProfile(userId, { reg: 'in_progress', regStep: 'fio' })
      break
  }

  await sendOrEditPrompt(ctx, userId, buildQuestionText(userId))
}

async function finishRegistration(ctx: any, userId: number) {
  // Финальный текст в том же регистрационном сообщении
  await sendOrEditPrompt(
    ctx,
    userId,
    '*✅ Регистрация завершена!*\n\nТеперь доступно главное меню.'
  )

  // Дальше — экранный UI
  goHome(userId)
  await renderScreen(ctx, userId, 'main')
}
