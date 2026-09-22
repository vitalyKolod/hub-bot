import { UserModel } from '../../models/User.js'
import { b, emoji, fmt } from '@grammyjs/parse-mode'
import { REGISTRATION_FIELDS } from './fields.js'

function stepTitle(step: string): string {
  switch (step) {
    case 'fio':
      return 'Шаг 1/3'
    case 'city':
      return 'Шаг 2/3'
    case 'church':
      return 'Шаг 3/3'
    case 'confirm_registration':
      return 'Проверка данных'
    default:
      return 'Регистрация'
  }
}

export async function buildQuestionText(userId: number): Promise<string> {
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
    case 'confirm_registration':
      return await buildConfirmationText(userId)
  }
  return header
}

export async function buildConfirmationText(userId: number): Promise<string> {
  const user = await UserModel.findOne({ telegramId: userId })

  if (!user) return 'Ошибка загрузки данных'

  const { fio, city, church } = REGISTRATION_FIELDS
  let text = `*📋 ПРОВЕРКА ДАННЫХ*

${fio.emoji} *${fio.label}:* ${user.fio || '-'}
${city.emoji} *${city.label}:* ${user.city || '-'}
${church.emoji} *${church.label}:* ${user.church || '-'}
`

  text += `

Всё верно?`
  return text
}

export async function buildConfirmationMessage(userId: number) {
  const user = await UserModel.findOne({ telegramId: userId })
  if (!user) return fmt`Ошибка загрузки данных`

  const fio = REGISTRATION_FIELDS.fio
  const city = REGISTRATION_FIELDS.city
  const church = REGISTRATION_FIELDS.church

  return fmt`${b}📋 ПРОВЕРКА ДАННЫХ${b}

${emoji(fio.customEmojiId)}${fio.emoji}${emoji(fio.customEmojiId)} ${b}${fio.label}:${b} ${user.fio || '-'}
${emoji(city.customEmojiId)}${city.emoji}${emoji(city.customEmojiId)} ${b}${city.label}:${b} ${user.city || '-'}
${emoji(church.customEmojiId)}${church.emoji}${emoji(church.customEmojiId)} ${b}${church.label}:${b} ${user.church || '-'}

Всё верно?`
}
