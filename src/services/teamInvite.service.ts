import crypto from 'crypto'
import { TeamInviteModel } from '../models/TeamInvite.js'
import { getTeamById } from './team.service.js'

const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000
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
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  const invite = await TeamInviteModel.create({
    teamId,
    code,
    status: 'active',
    createdBy,
    usedBy: null,
    expiresAt,
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

  if (invite.status === 'expired' || invite.expiresAt < new Date()) {
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
  const invite = await getInviteByCode(code)
  if (!invite) return null

  invite.status = 'used'
  invite.usedBy = usedBy
  await invite.save()

  return invite
}

/**
 * Все приглашения команды — пригодится для отображения статусов владельцу.
 */
export async function getTeamInvites(teamId: string) {
  return TeamInviteModel.find({ teamId }).sort({ createdAt: -1 })
}
