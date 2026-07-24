import { UserModel } from '../../models/User.js'

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

  let text = `*📋 ПРОВЕРКА ДАННЫХ*

👤 *ФИО:* ${user.fio || '-'}
🌍 *Город:* ${user.city || '-'}
⛪ *Церковь:* ${user.church || '-'}
`

  text += `

Всё верно?`
  return text
}
