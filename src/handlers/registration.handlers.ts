import { InlineKeyboard } from 'grammy'
import { UserModel } from '../models/User.js'
import { getOrCreateUser } from '../services/user.service.js'
import { finishRegistration } from '../flows/registration/index.js'
import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import type { MyContext } from '../types/context.js'
import { computeDaysLeft } from '../state/profile.js'

export async function handleEditRegistration(ctx: MyContext) {
  const kb = new InlineKeyboard()
    .text('ФИО', 'edit_field:fio')
    .icon('5258011929993026890')
    .row()
    .text('Город', 'edit_field:city')
    .icon('5453906530824903181')
    .row()
    .text('Церковь', 'edit_field:church')
    .icon('5370857213533379300')
    .row()

  await ctx.editMessageText('Что хотите изменить?', {
    reply_markup: kb,
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
  await UserModel.updateOne(
    { telegramId: userId },
    {
      reg: 'done',
      regStep: 'done',
    }
  )

  const profile = await getOrCreateUser(userId)

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

  ctx.session.editingField = undefined

  await ctx.reply('✅ Данные обновлены')

  const { buildConfirmationText } = await import('../flows/registration/index.js')

  const kb = new InlineKeyboard()
    .text('✅ Подтвердить', 'confirm_registration')
    .row()
    .text('✏️ Изменить данные', 'edit_registration')

  await ctx.reply(await buildConfirmationText(userId), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  })
}
