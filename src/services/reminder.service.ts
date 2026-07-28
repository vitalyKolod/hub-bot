import { Bot } from 'grammy'
import { UserModel } from '../models/User.js'
import { PROP_FLOWS } from '../data/ProPresenterFLows.js'

// считаем дни
function getDaysLeft(date?: Date | string | null) {
  if (!date) return 0

  const target = new Date(date)
  const now = new Date()

  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)

  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// проверка — надо ли отправлять
function shouldSend(daysLeft: number) {
  if (daysLeft > 30 || daysLeft <= 0) return false
  if (daysLeft % 3 !== 0 && daysLeft !== 1) return false
  return true
}

// универсальная отправка
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
    // ================= CONTENT =================
    const content = user.subscriptions?.content

    if (content?.status === 'active' && content.expiresAt) {
      const daysLeft = getDaysLeft(content.expiresAt)

      console.log('CONTENT USER:', user.telegramId, 'DAYS:', daysLeft)

      if (shouldSend(daysLeft)) {
        const key = `content_${daysLeft}`

        const text =
          daysLeft === 1
            ? `⚠️ *Подписка заканчивается завтра!*\n\n❗ Если не продлить — вы будете удалены из группы.\n\n👉 Продлите сейчас`
            : `⏳ *Контент для экранов*\n\nОсталось ${daysLeft} дней\n\n👉Чтобы продлить зайдите в /profile`

        await sendReminder({ bot, user, key, text })
      }
    }

    // ================= PROPRESENTER =================
    const prop = user.subscriptions?.propresenter

    if (prop?.status === 'active') {
      const flowData = PROP_FLOWS.find((f) => f.flow === Number(prop.flow))

      if (!flowData?.expiresAt) continue

      const daysLeft = getDaysLeft(flowData.expiresAt)

      if (daysLeft <= 0) {
        await kickUser(bot, user, Number(process.env.CONTENT_GROUP_ID))

        await UserModel.updateOne(
          { telegramId: user.telegramId },
          {
            'subscriptions.content.status': 'expired',
          }
        )

        continue
      }

      console.log('PROP USER:', user.telegramId, 'DAYS:', daysLeft)

      if (shouldSend(daysLeft)) {
        const key = `prop_${daysLeft}`

        const text =
          `🎬 *У вас заканчивается подписка на ${flowData.flow} поток ProPresenter *\n\n` +
          `⏳ Осталось ${daysLeft} дней\n\n` +
          `❗ Обсудите продление в чате потока, чтобы не потерять доступ\n\n`

        await sendReminder({ bot, user, key, text })
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
      '❌ Ваша подписка закончилась. Вы были удалены из группы. \n\n👉 Чтобы восстановить доступ, продлите подписку в /profile'
    )

    console.log(`🚫 Кикнут пользователь ${user.telegramId}`)
  } catch (err) {
    console.error('Ошибка кика:', err)
  }
}
