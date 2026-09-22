import { InlineKeyboard } from 'grammy'
import { UserModel } from '../models/User.js'
import { getOrCreateUser } from '../services/user.service.js'
import {
  buildConfirmationMessage,
  confirmationKeyboard,
  finishRegistration,
  REGISTRATION_FIELDS,
  sendRegistrationAdminNotification,
} from '../flows/registration/index.js'
import { goHome, goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import type { MyContext } from '../types/context.js'
import { computeDaysLeft } from '../state/profile.js'
import { auditLogService } from '../services/auditLog.service.js'

export async function handleEditRegistration(ctx: MyContext) {
  const kb = new InlineKeyboard()
  for (const [field, metadata] of Object.entries(REGISTRATION_FIELDS)) {
    kb.text(metadata.label, `edit_field:${field}`).icon(metadata.customEmojiId).row()
  }
  kb.text('← Назад', 'edit_registration_back')

  await ctx.editMessageText('Что хотите изменить?', {
    reply_markup: kb,
  })
}

export async function handleEditRegistrationBack(ctx: MyContext, userId: number) {
  const message = await buildConfirmationMessage(userId)
  await ctx.editMessageText(message.text, {
    entities: message.entities,
    reply_markup: confirmationKeyboard(),
  })
}

export async function handleEditField(ctx: MyContext, field: string) {
  ctx.session.editingField = field as any

  let text = ''
  switch (field) {
    case 'fio':
      text = 'Введите новое ФИО'
      break
    case 'city':
      text = 'Введите новый город'
      break
    case 'church':
      text = 'Введите новую церковь'
      break
  }

  await ctx.api.sendMessage(ctx.from!.id, text)
}

export async function handleConfirmRegistration(ctx: MyContext, userId: number) {
  const existingProfile = await getOrCreateUser(userId)
  if (existingProfile.reg === 'done') {
    await ctx.reply('✅ Вы уже зарегистрированы в ХАБе.')
    goHome(userId)
    await renderScreen(ctx, userId, 'main', undefined, { forceNew: true })
    return
  }

  const result = await UserModel.updateOne(
    { telegramId: userId, reg: { $ne: 'done' } },
    {
      reg: 'done',
      regStep: 'done',
    }
  )

  if (!result.modifiedCount) {
    await ctx.reply('✅ Вы уже зарегистрированы в ХАБе.')
    return
  }

  const profile = await getOrCreateUser(userId)

  await auditLogService.createLog({
    type: 'user.registered',
    actorType: 'user',
    actorTelegramId: userId,
    targetUserId: userId,
    metadata: {
      userName: profile.fio,
      username: profile.username,
      city: profile.city,
      church: profile.church,
    },
  })

  try {
    await sendRegistrationAdminNotification(ctx, userId)
  } catch (error) {
    console.error('Registration admin topic notification failed:', error)
  }

  if (profile.pendingInviteCode) {
    goTo(userId, 'team_invite')
    await renderScreen(ctx, userId, 'team_invite', profile.pendingInviteCode, {
      forceNew: true,
    })
  } else {
    await finishRegistration(ctx, userId)
  }
}

export async function handleEditingFieldText(ctx: MyContext, userId: number) {
  const field = ctx.session.editingField
  const value = ctx.message!.text!.trim()

  const update: any = {}

  if (field === 'fio' && value.length >= 3) {
    update.fio = value
  }

  if (field === 'city') {
    update.city = value
  }

  if (field === 'church') {
    update.church = value
  }

  if (field === 'prop_stream_no') {
    const n = Number(value)
    if (!Number.isFinite(n)) {
      await ctx.reply('Введите число')
      return
    }
    update['subscriptions.propresenter.flow'] = Math.floor(n)
  }

  if (field === 'screens_end_date') {
    const parsed = computeDaysLeft(value)
    if (!parsed) {
      await ctx.reply('Неверная дата')
      return
    }
    update['subscriptions.content.expiresAt'] = parsed.date
  }

  await UserModel.updateOne({ telegramId: userId }, { $set: update })

  const changedField = field as string | undefined
  if (changedField && Object.keys(update).length) {
    const profile = await getOrCreateUser(userId)
    await auditLogService.createLog({
      type: 'user.profile_updated',
      actorType: 'user',
      actorTelegramId: userId,
      targetUserId: userId,
      metadata: {
        userName: profile.fio,
        field: changedField,
        newValue: value,
        change: `${changedField}: изменено`,
      },
    })
  }

  ctx.session.editingField = undefined

  await ctx.reply('✅ Данные обновлены')

  const message = await buildConfirmationMessage(userId)
  await ctx.reply(message.text, {
    entities: message.entities,
    reply_markup: confirmationKeyboard(),
  })
}
