import { InlineKeyboard } from 'grammy'
import { setInputMode, clearInputMode, getOrCreateUser } from '../services/user.service.js'
import { INPUT_MODES } from '../constants/input-modes.js'
import { goTo, goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { createTeam, addMemberToTeam } from '../services/team.service.js'
import { validateInvite, consumeInvite, restoreInvite } from '../services/teamInvite.service.js'
import { UserModel } from '../models/User.js'
import type { MyContext } from '../types/context.js'

export async function handleCreateTeamStart(ctx: MyContext, userId: number) {
  await setInputMode(userId, INPUT_MODES.CREATE_TEAM)
  goTo(userId, 'create_team_name')
  await renderScreen(ctx, userId, 'create_team_name')
}

export async function handleCreateTeamText(ctx: MyContext, userId: number) {
  const teamName = ctx.message!.text!.trim()

  if (teamName.length < 3) {
    await ctx.reply('Название команды должно содержать минимум 3 символа.')
    return
  }

  if (teamName.length > 50) {
    await ctx.reply('Название команды слишком длинное.')
    return
  }

  const team = await createTeam(userId, teamName)

  await clearInputMode(userId)

  await ctx.reply(`✅ Команда "${team.name}" создана!`)

  goTo(userId, 'team')
  await renderScreen(ctx, userId, 'team', { teamId: team._id.toString() }, { forceNew: true })
}

export async function handleAcceptTeamInvite(ctx: MyContext, userId: number, code: string) {
  const check = await validateInvite(code)

  if (!check.ok) {
    const reasonText: Record<string, string> = {
      not_found: 'Приглашение не найдено.',
      used: 'Эта ссылка уже была использована.',
      expired: 'Срок действия старой ссылки истёк.',
      team_not_found: 'Команда не найдена.',
      team_full: 'Команда уже заполнена.',
    }
    await ctx.answerCallbackQuery({ text: reasonText[check.reason] || 'Ошибка' })
    goHome(userId)
    await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })
    return
  }

  // Условное обновление не даст двум одновременным нажатиям использовать
  // одну оплаченную ссылку дважды.
  const consumedInvite = await consumeInvite(code, userId)
  if (!consumedInvite) {
    await ctx.answerCallbackQuery({ text: 'Эта ссылка уже была использована.' })
    goHome(userId)
    await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })
    return
  }

  try {
    await addMemberToTeam(check.team._id.toString(), userId)
  } catch (error) {
    await restoreInvite(code, userId)
    throw error
  }

  await UserModel.updateOne({ telegramId: userId }, { pendingInviteCode: null })

  const newMember = await getOrCreateUser(userId)

  await ctx.api.sendMessage(
    check.team.ownerId,
    `🎉 ${newMember.fio || 'Новый участник'} присоединился к команде «${check.team.name}»!
    чтобы вернуться в меню команд - нажмите /team_list`
  )

  await ctx.answerCallbackQuery({ text: '✅ Вы в команде!' })

  goHome(userId)
  await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })
}

export async function handleDeclineTeamInvite(ctx: MyContext, userId: number) {
  // код остаётся активным — можно переслать другому (как договорились)
  await UserModel.updateOne({ telegramId: userId }, { pendingInviteCode: null })

  await ctx.answerCallbackQuery({ text: 'Приглашение отклонено' })

  goHome(userId)
  await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })
}
