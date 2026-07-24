import { Bot } from 'grammy'
import { UserModel } from '../models/User.js'
import { PROP_FLOWS } from '../data/ProPresenterFLows.js'

// Функция расчета точного времени до истечения
function getTimeLeft(date?: Date | string | null) {
  if (!date) return null

  const target = new Date(date).getTime()
  const now = Date.now()
  const diffMs = target - now

  if (diffMs <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  return { expired: false, days, hours, minutes, seconds, totalMs: diffMs }
}

// Форматируем красивую строку оставшегося времени
function formatTimeLeft(timeLeft: {
  days: number
  hours: number
  minutes: number
  seconds: number
}) {
  const parts = []
  if (timeLeft.days > 0) parts.push(`${timeLeft.days} дн.`)
  parts.push(`${timeLeft.hours} ч.`)
  parts.push(`${timeLeft.minutes} мин.`)
  parts.push(`${timeLeft.seconds} сек.`)
  return parts.join(' ')
}

// Проверка — надо ли отправлять напоминание (например, ровно за 3 дня, за 2 дня, за 1 день или за несколько часов)
// Вместо строгой проверки по дням, проверяем пороги в миллисекундах
function shouldSendReminder(totalMs: number, sentList: string[], prefix: string) {
  const ONE_HOUR = 1000 * 60 * 60
  const ONE_DAY = ONE_HOUR * 24

  // Пороги для отправки: за 3 дня, за 2 дня, за 1 день, за 6 часов
  const thresholds = [
    { key: `${prefix}_3d`, ms: 3 * ONE_DAY },
    { key: `${prefix}_2d`, ms: 2 * ONE_DAY },
    { key: `${prefix}_1d`, ms: 1 * ONE_DAY },
    { key: `${prefix}_6h`, ms: 6 * ONE_HOUR },
  ]

  for (const t of thresholds) {
    // Если осталось меньше или равно порогу, но еще не отправляли этот ключ
    if (totalMs <= t.ms && !sentList.includes(t.key)) {
      return t.key
    }
  }

  return null
}

// Универсальная отправка
async function sendReminder({
  bot,
  user,
  key,
  text,
}: {
  bot: Bot
  user: any
  key: string
  text: string
}) {
  const alreadySent = user.reminders || []
  if (alreadySent.includes(key)) return

  try {
    await bot.api.sendMessage(user.telegramId, text, {
      parse_mode: 'Markdown',
    })

    await UserModel.updateOne(
      { telegramId: user.telegramId },
      {
        $push: { reminders: key },
      }
    )
  } catch (err) {
    console.error('Ошибка напоминания:', err)
  }
}

export async function runReminders(bot: Bot) {
  const users = await UserModel.find({})

  for (const user of users) {
    const alreadySent = user.reminders || []

    // ================= CONTENT =================
    const content = user.subscriptions?.content

    if (content?.status === 'active' && content.expiresAt) {
      const time = getTimeLeft(content.expiresAt)

      if (time) {
        if (time.expired) {
          // Действие при истечении (если нужно кикать или менять статус)
          continue
        }

        const reminderKey = shouldSendReminder(time.totalMs, alreadySent, 'content')

        if (reminderKey) {
          const timeStr = formatTimeLeft(time)
          const text =
            `⏳ *Контент для экранов*\n\n` +
            `До окончания подписки осталось:\n` +
            `👉 *${timeStr}*\n\n` +
            `Чтобы продлить доступ, зайдите в /profile`

          await sendReminder({ bot, user, key: reminderKey, text })
        }
      }
    }

    // ================= PROPRESENTER =================
    const prop = user.subscriptions?.propresenter

    if (prop?.status === 'active') {
      const flowData = PROP_FLOWS.find((f) => f.flow === Number(prop.flow))
      if (!flowData?.expiresAt) continue

      const time = getTimeLeft(flowData.expiresAt)

      if (time) {
        if (time.expired) {
          await kickUser(bot, user, Number(process.env.CONTENT_GROUP_ID))
          await UserModel.updateOne(
            { telegramId: user.telegramId },
            {
              'subscriptions.content.status': 'expired',
            }
          )
          continue
        }

        const reminderKey = shouldSendReminder(time.totalMs, alreadySent, `prop_${prop.flow}`)

        if (reminderKey) {
          const timeStr = formatTimeLeft(time)
          const text =
            `🎬 *Подписка на ${flowData.flow} поток ProPresenter*\n\n` +
            `До окончания подписки осталось:\n` +
            `👉 *${timeStr}*\n\n` +
            `❗ Обсудите продление в чате потока, чтобы не потерять доступ.`

          await sendReminder({ bot, user, key: reminderKey, text })
        }
      }
    }
  }
}

async function kickUser(bot: Bot, user: any, chatId: number) {
  try {
    await bot.api.banChatMember(chatId, user.telegramId)
    await bot.api.unbanChatMember(chatId, user.telegramId)
    await bot.api.sendMessage(
      user.telegramId,
      '❌ Ваша подписка закончилась. Вы были удалены из группы.\n\n👉 Чтобы восстановить доступ, продлите подписку в /profile'
    )
    console.log(`🚫 Кикнут пользователь ${user.telegramId}`)
  } catch (err) {
    console.error('Ошибка кика:', err)
  }
}
