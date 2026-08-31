import crypto from 'crypto'
import { TeamInviteModel } from '../models/TeamInvite.js'
import { getTeamById } from './team.service.js'

const MAX_TEAM_MEMBERS = 5

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex') // 8 символов, например "a1b2c3d4"
}

/**
 * Создать новое приглашение для команды.
 * createdBy — обычно владелец, который только что оплатил слот.
 */
export async function createTeamInvite(teamId: string, createdBy: number) {
  const code = generateCode()

  const invite = await TeamInviteModel.create({
    teamId,
    code,
    status: 'active',
    createdBy,
    usedBy: null,
  })

  return invite
}

/**
 * Найти приглашение по коду.
 */
export async function getInviteByCode(code: string) {
  return TeamInviteModel.findOne({ code })
}

/**
 * Проверить приглашение перед показом экрана "принять/отклонить".
 * Возвращает причину отказа, если что-то не так, либо ok: true + сам invite и team.
 */
export async function validateInvite(code: string) {
  const invite = await getInviteByCode(code)

  if (!invite) {
    return { ok: false, reason: 'not_found' as const }
  }

  if (invite.status === 'used') {
    return { ok: false, reason: 'used' as const }
  }

  // Старые приглашения могли иметь TTL. Новые ссылки остаются активными,
  // пока первый участник не примет приглашение.
  if (invite.status === 'expired' || (invite.expiresAt && invite.expiresAt < new Date())) {
    if (invite.status !== 'expired') {
      invite.status = 'expired'
      await invite.save()
    }
    return { ok: false, reason: 'expired' as const }
  }

  const team = await getTeamById(invite.teamId)

  if (!team) {
    return { ok: false, reason: 'team_not_found' as const }
  }

  if (team.members.length >= MAX_TEAM_MEMBERS) {
    return { ok: false, reason: 'team_full' as const }
  }

  return { ok: true as const, invite, team }
}

/**
 * Погасить приглашение — вызывается, когда человек реально жмёт "Принять".
 */
export async function consumeInvite(code: string, usedBy: number) {
  return TeamInviteModel.findOneAndUpdate(
    { code, status: 'active' },
    { $set: { status: 'used', usedBy } },
    { new: true }
  )
}

/** Вернуть приглашение в работу, если добавление участника не сохранилось. */
export async function restoreInvite(code: string, usedBy: number) {
  return TeamInviteModel.updateOne(
    { code, status: 'used', usedBy },
    { $set: { status: 'active', usedBy: null } }
  )
}

/**
 * Все приглашения команды — пригодится для отображения статусов владельцу.
 */
export async function getTeamInvites(teamId: string) {
  return TeamInviteModel.find({ teamId }).sort({ createdAt: -1 })
}
