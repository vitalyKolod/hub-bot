import { UserModel } from '../models/User.js'
import { getOrCreateUser } from './user.service.js'

// 🔍 Найти юзера по telegramId
export async function getUserByTelegramId(telegramId: number) {
  return UserModel.findOne({ telegramId })
}

// 🔍 Найти юзера по username
export async function getUserByUsername(username: string) {
  return UserModel.findOne({ username: username.toLowerCase() })
}

// 🔍 Найти юзера по номеру телефона (из контакта)
export async function getUserByPhone(phone: string) {
  return UserModel.findOne({ phone })
}

// ❗ Проверка — можно ли добавить волонтёра
export async function canAddVolunteer(ownerId: number, volunteerId: number) {
  const owner = await getUserByTelegramId(ownerId)
  const volunteer = await getUserByTelegramId(volunteerId)

  if (!owner || !volunteer) {
    return { ok: false, reason: 'user_not_found' }
  }

  // нет подписки
  if (owner.subscriptions?.content?.status !== 'active') {
    return { ok: false, reason: 'no_subscription' }
  }

  // подписка истекла
  if (owner.subscriptions?.content?.expiresAt) {
    const now = new Date()
    if (owner.subscriptions.content.expiresAt < now) {
      return { ok: false, reason: 'expired' }
    }
  }

  // лимит 5
  if ((owner.volunteers?.length || 0) >= 5) {
    return { ok: false, reason: 'limit' }
  }

  // уже добавлен
  if (owner.volunteers?.includes(volunteerId)) {
    return { ok: false, reason: 'already_added' }
  }

  // волонтер уже у кого-то есть
  const exists = await UserModel.findOne({ volunteers: volunteerId })
  if (exists) {
    return { ok: false, reason: 'already_has_owner' }
  }

  return { ok: true }
}

// ➕ Добавить волонтёра
export async function addVolunteer(ownerId: number, volunteerId: number) {
  const owner = await getUserByTelegramId(ownerId)

  if (!owner) return

  const expires = owner.subscriptions?.content?.expiresAt

  await UserModel.updateOne(
    { telegramId: ownerId },
    {
      $push: { volunteers: volunteerId },
      $inc: { 'subscriptions.content.extraUsers': 1 },
    }
  )

  await UserModel.updateOne(
    { telegramId: volunteerId },
    {
      isVolunteer: true,
      ownerId: ownerId,
      'subscriptions.content.status': 'active',
      'subscriptions.content.expiresAt': expires,
    }
  )
}

//активировать волонтера

export async function activateVolunteer(ownerId: number, volunteerId: number) {
  const owner = await getOrCreateUser(ownerId)
  const volunteer = await getOrCreateUser(volunteerId)

  if (!owner.subscriptions?.content?.expiresAt) {
    return { ok: false }
  }

  const expiresAt = owner.subscriptions.content.expiresAt

  // 👉 добавляем в список владельца
  if (!owner.subscriptions.volunteers) {
    owner.subscriptions.volunteers = []
  }

  const alreadyExists = owner.subscriptions.volunteers.find((v) => v.telegramId === volunteerId)

  if (!alreadyExists) {
    owner.subscriptions.volunteers.push({
      telegramId: volunteerId,
      fio: volunteer.fio || '',
    })
  }

  // 👉 помечаем волонтёра
  volunteer.volunteer = {
    ownerId,
  }

  // 👉 даём доступ
  volunteer.subscriptions.content = {
    status: 'active',
    expiresAt,
  }

  // 👉 увеличиваем счётчик
  owner.subscriptions.content.extraUsers = (owner.subscriptions.content.extraUsers || 0) + 1

  await owner.save()
  await volunteer.save()

  return { ok: true }
}

// ❌ Удалить волонтёра
export async function removeVolunteer(ownerId: number, volunteerId: number) {
  await UserModel.updateOne(
    { telegramId: ownerId },
    {
      $pull: { volunteers: volunteerId },
      $inc: { 'subscriptions.content.extraUsers': -1 },
    }
  )

  await UserModel.updateOne(
    { telegramId: volunteerId },
    {
      isVolunteer: false,
      ownerId: null,
      'subscriptions.content.status': 'none',
      'subscriptions.content.expiresAt': null,
    }
  )
}
