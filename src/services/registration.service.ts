import { UserModel } from '../models/User.js'
import { getOrCreateUser } from './user.service.js'
import { auditLogService } from './auditLog.service.js'

export async function confirmUserRegistration(userId: number) {
  const user = await getOrCreateUser(userId)
  if (user.reg === 'done') return { user, applied: false }
  if (!user.fio || user.fio.trim().length < 3 || !user.city?.trim() || !user.church?.trim()) throw new Error('Заполните ФИО, город и церковь')
  const result = await UserModel.updateOne({ telegramId: userId, reg: { $ne: 'done' } }, { reg: 'done', regStep: 'done' })
  const profile = await getOrCreateUser(userId)
  if (result.modifiedCount) await auditLogService.createLog({ type: 'user.registered', actorType: 'user', actorTelegramId: userId, targetUserId: userId, metadata: { userName: profile.fio, username: profile.username, city: profile.city, church: profile.church } })
  return { user: profile, applied: Boolean(result.modifiedCount) }
}
