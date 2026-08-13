import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getTeamById } from '../services/team.service.js'
import { UserModel } from '../models/User.js'

export async function teamInviteScreen(userId: number, code: string): Promise<ScreenView> {
  const { validateInvite } = await import('../services/teamInvite.service.js')
  const check = await validateInvite(code)

  const kb = new InlineKeyboard()

  if (!check.ok) {
    const reasonText: Record<string, string> = {
      not_found: 'Приглашение не найдено.',
      used: 'Эта ссылка уже была использована.',
      expired: 'Срок действия ссылки истёк (24 часа).',
      team_not_found: 'Команда не найдена.',
      team_full: 'Команда уже заполнена (максимум 5 участников).',
    }

    kb.text('🏠 ГЛАВНОЕ МЕНЮ', packCb({ a: 'home' }))

    return {
      photo: './public/profile.png',
      caption: `❌ *Приглашение недействительно*\n\n${reasonText[check.reason] || ''}`,
      keyboard: kb,
    }
  }

  const owner = await UserModel.findOne({ telegramId: check.team.ownerId })

  kb.text('✅ Принять', packCb({ a: 'accept_team_invite', p: code })).row()
  kb.text('❌ Отклонить', packCb({ a: 'decline_team_invite', p: code }))

  return {
    photo: './public/my-teams.png',
    caption:
      `🎉 *ПРИГЛАШЕНИЕ В КОМАНДУ*\n\n` +
      `${owner?.fio || 'Пользователь'} приглашает вас в команду:\n` +
      `*«${check.team.name}»*\n\n` +
      `Принять приглашение?`,
    keyboard: kb,
  }
}
