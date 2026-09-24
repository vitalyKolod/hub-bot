import { FormattedString } from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'

import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { UserModel } from '../models/User.js'
import { getUserTeams } from '../services/team.service.js'
import { PROFILE_ICONS } from '../ui/emoji/icons.js'

const MAX_VISIBLE_VOLUNTEERS = 5

export type ProfileUser = {
  fio?: string | null
  username?: string | null
  city?: string | null
  church?: string | null
}

export type ProfileMember = {
  telegramId?: number
  role?: string
  status?: string
  fio?: string | null
  username?: string | null
}

export type ProfileTeam = {
  name?: string | null
  ownerId?: number
  members?: ProfileMember[]
  subscriptions?: Map<string, unknown> | Record<string, unknown> | null
}

function valueOrFallback(value: unknown, fallback = 'Не указано') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function subscriptionCount(subscriptions: ProfileTeam['subscriptions']) {
  if (subscriptions instanceof Map) return subscriptions.size
  if (subscriptions && typeof subscriptions === 'object') return Object.keys(subscriptions).length
  return 0
}

function memberName(member: ProfileMember) {
  const fio = String(member.fio ?? '').trim()
  if (fio) return fio
  const username = String(member.username ?? '')
    .trim()
    .replace(/^@/, '')
  return username ? `@${username}` : 'Пользователь'
}

function isActiveMember(member: ProfileMember) {
  return member.status !== 'pending'
}

export function buildProfileMessage(
  userId: number,
  user: ProfileUser,
  teams: ProfileTeam[]
): FormattedString {
  let message = new FormattedString('')
    .emoji('👤', PROFILE_ICONS.profile)
    .bold(' МОЙ ПРОФИЛЬ')
    .plain('\n\n')
    .bold(valueOrFallback(user.fio, 'Имя не указано'))

  const username = String(user.username ?? '')
    .trim()
    .replace(/^@/, '')
  if (username) message = message.plain(`\n@${username}`)

  message = message
    .plain('\n\n├ ')
    .emoji('🏙', PROFILE_ICONS.city)
    .plain(` Город: ${valueOrFallback(user.city)}`)
    .plain('\n├ ')
    .emoji('⛪', PROFILE_ICONS.church)
    .plain(` Церковь: ${valueOrFallback(user.church)}`)
    .plain(`\n└ Команд: ${teams.length}`)
    .plain('\n────────────\n')
    .emoji('▫️', PROFILE_ICONS.teams)
    .bold(' МОИ КОМАНДЫ')
    .plain('\n\n')

  if (teams.length === 0) return message.plain('└ Пока у вас нет команд.')

  teams.forEach((team, teamIndex) => {
    try {
      const members = Array.isArray(team.members) ? team.members.filter(isActiveMember) : []
      const isOwner = team.ownerId === userId
      const ownMembership = members.find((member) => member.telegramId === userId)
      const role = isOwner || ownMembership?.role === 'owner' ? 'Владелец' : 'Волонтёр'
      const volunteers = members.filter(
        (member) => member.role !== 'owner' && member.telegramId !== team.ownerId
      )

      message = message
        // .plain('\n')
        .emoji('👥', PROFILE_ICONS.team)
        .bold(` ${valueOrFallback(team.name, 'Команда')}${isOwner ? ' 👑' : ''}`)
        .plain(`\n\n├ Роль: ${role}`)
        .plain(`\n├ Подписок: ${subscriptionCount(team.subscriptions)}`)

      if (isOwner) message = message.plain(`\n├ Волонтёров: ${volunteers.length}`)
      message = message.plain(`\n└ Участников: ${members.length}`)

      if (isOwner && volunteers.length > 0) {
        message = message.plain('\n\nВолонтёры:\n\n')
        const visible = volunteers.slice(0, MAX_VISIBLE_VOLUNTEERS)
        visible.forEach((volunteer, index) => {
          const isLast = index === visible.length - 1 && volunteers.length <= MAX_VISIBLE_VOLUNTEERS
          message = message.plain(`${isLast ? '└' : '├'} ${memberName(volunteer)}\n`)
        })
        if (volunteers.length > MAX_VISIBLE_VOLUNTEERS) {
          message = message.plain(`└ + ещё ${volunteers.length - MAX_VISIBLE_VOLUNTEERS}\n`)
        }
      }

      if (teamIndex < teams.length - 1) message = message.plain('\n────────────\n')
    } catch (error) {
      console.error('Profile team rendering failed:', error)
      message = message.plain('\n\nКоманда\n\n└ Данные временно недоступны.')
    }
  })

  return message
}

export function buildProfileKeyboard() {
  return new InlineKeyboard().text('← Назад', packCb({ a: 'home' }))
}

export async function profileScreen(userId: number): Promise<ScreenView> {
  const [user, rawTeams] = await Promise.all([
    UserModel.findOne({ telegramId: userId }),
    getUserTeams(userId),
  ])

  const memberIds = [
    ...new Set(
      rawTeams.flatMap((team) =>
        Array.isArray(team?.members)
          ? team.members.map((member) => member?.telegramId).filter(Number.isSafeInteger)
          : []
      )
    ),
  ].filter(Number.isSafeInteger)
  const profiles = memberIds.length ? await UserModel.find({ telegramId: { $in: memberIds } }) : []
  const profilesById = new Map(profiles.map((profile) => [profile.telegramId, profile]))

  const teams: ProfileTeam[] = rawTeams.map((team) => {
    try {
      return {
        name: team?.name,
        ownerId: team?.ownerId,
        subscriptions: team?.subscriptions,
        members: Array.isArray(team?.members)
          ? team.members.filter(Boolean).map((member) => ({
              telegramId: member.telegramId,
              role: member.role,
              status: member.status,
              fio: profilesById.get(member.telegramId)?.fio,
              username: profilesById.get(member.telegramId)?.username,
            }))
          : [],
      }
    } catch (error) {
      console.error('Profile team normalization failed:', error)
      return { name: team?.name }
    }
  })
  const message = buildProfileMessage(userId, user ?? {}, teams)
  const keyboard = buildProfileKeyboard()

  return {
    photo: './public/profile.png',
    caption: message.caption,
    caption_entities: message.caption_entities,
    keyboard,
  }
}
