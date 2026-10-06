import { InlineKeyboard, type Api, type Context } from 'grammy'
import { ProPresenterRenewalCampaignModel, ProPresenterRenewalSeatModel } from '../models/ProPresenterRenewal.js'
import { TeamModel } from '../models/Team.js'
import { getRenewalCampaign, eligibleSeats, launchRenewal, renewalPreview, renewalPromptCandidates, renewalStartLink, renewalStats, voteForDevice, declineTeamDevices, completeRenewal, syncRenewalSummary, renewalAcceptsNewPayments, setRenewalSummaryView, syncRenewalPollKeyboard, convertLegacyRenewal } from '../services/proPresenterRenewal.service.js'
import { hasAdminPermission, listAdminAccess } from '../services/adminAccess.service.js'
import { startRenewalCheckout } from './payment.handlers.js'
import { apCb } from '../constants/admin-panel.js'

const DAY_MS = 86_400_000

async function answer(ctx: Context, text?: string, showAlert = false) {
  await ctx.answerCallbackQuery({ text, show_alert: showAlert }).catch(() => {})
}

async function sendRenewalConfirmation(api: Api, userId: number, campaignId: string, teamId: string, flowNumber: number) {
  return api.sendMessage(userId, `Вы ответили, что будете продлевать поток ProPresenter №${flowNumber}. Действительно хотите продлить устройства вашей команды?`, {
    reply_markup: new InlineKeyboard()
      .text('✅ Да, буду продлевать', `pr:y:${campaignId}:${teamId}`).row()
      .text('👎 Нет, передумал', `pr:n:${campaignId}:${teamId}`),
  })
}

export async function sendDeviceChoices(api: Api, userId: number, campaignId: string, teamId: string, messageId?: number) {
  const campaign = await getRenewalCampaign(campaignId)
  const seat = (await eligibleSeats(campaignId, userId)).find((item) => item.teamId === teamId)
  if (!campaign || !seat) throw new Error('Команда больше не доступна вам')
  const devices = seat.devices.filter((device) => device.active !== false)
  const kb = new InlineKeyboard()
  for (const device of devices) {
    if (device.paymentStatus === 'none') {
      kb.text(`${device.vote === 'yes' ? '✅' : '☑️'} ${device.name}`.slice(0, 60), `pr:d:${campaignId}:${device.deviceId}:t`).row()
    }
  }
  const selected = devices.filter((device) => device.paymentStatus === 'none' && device.vote === 'yes')
  if (selected.length && seat.paymentStatus !== 'pending') kb.text(`💳 Оплатить ${selected.length} устр.`, `pr:c:${campaignId}:${teamId}`).row()
  const lines = devices.map((device) => `• ${device.name} — ${device.paymentStatus === 'paid' ? '💸 оплачено' : device.paymentStatus === 'pending' ? '🧾 чек на проверке' : device.vote === 'yes' ? '✅ выбрано' : device.vote === 'no' ? '☑️ не выбрано' : '☑️ не выбрано'}`)
  const text = `📡 ProPresenter · поток №${campaign.flowNumber}\nКоманда «${seat.teamName}»\n\nОтметьте устройства для продления. Серая галочка — не выбрано, зелёная — выбрано:\n${lines.join('\n')}\n\n${selected.length ? `К оплате: ${selected.length} × ${campaign.priceRub} ₽ = ${selected.length * campaign.priceRub} ₽ или ${selected.length * campaign.priceUsd} USDT.` : 'Выберите хотя бы одно устройство, чтобы перейти к оплате.'}\n\nВыбор можно изменить до отправки чека.`
  if (messageId) {
    try { return await api.editMessageText(userId, messageId, text, { reply_markup: kb }) }
    catch (error) { if (String((error as any)?.description || error).includes('message is not modified')) return; }
  }
  return api.sendMessage(userId, text, { reply_markup: kb })
}

export async function showRenewalEntry(ctx: any, campaignId: string) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || !renewalAcceptsNewPayments(campaign)) {
    await ctx.reply('Этот сбор продления уже закрыт или недоступен.')
    return
  }
  if (campaign.billingMode !== 'device') {
    await ctx.reply('Сбор обновляется под оплату устройств. Дождитесь подтверждения администратора.')
    return
  }
  const seats = await eligibleSeats(campaignId, ctx.from.id)
  if (!seats.length) {
    await ctx.reply('Продлить поток может только владелец команды с подпиской ProPresenter в этом потоке.')
    return
  }
  if (seats.length === 1) {
    const seat = seats[0]
    await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, seat.teamId)
    return
  }
  const kb = new InlineKeyboard()
  for (const seat of seats) {
    kb.text(seat.teamName.slice(0, 45), `pr:e:${campaignId}:${seat.teamId}`).row()
  }
  await ctx.reply(`У вас несколько команд в потоке №${campaign.flowNumber}. Выберите команду для продления:`, { reply_markup: kb })
}

async function showAdminPreview(ctx: any, flowNumber: number) {
  let preview: Awaited<ReturnType<typeof renewalPreview>>
  try { preview = await renewalPreview(flowNumber) }
  catch (error) {
    await ctx.reply(`📡 Сбор продления · поток №${flowNumber}\n\n${error instanceof Error ? error.message : 'Проверьте данные потока'}`, {
      reply_markup: new InlineKeyboard().text('✏️ Карточка потока', apCb('stream', flowNumber)),
    })
    return
  }
  const { stream, teams, devices, existing } = preview
  let chatTitle = 'чат не привязан'
  if (stream.chatId) {
    const chat = await ctx.api.getChat(stream.chatId).catch(() => null)
    chatTitle = chat && 'title' in chat ? chat.title : `ID ${stream.chatId} (бот не видит чат)`
  }
  const text = [
    `📡 Запуск продления · поток №${flowNumber}`,
    `Дата окончания: ${stream.expiresAt!.toLocaleDateString('ru-RU')}`,
    `Чат: ${chatTitle}`,
    `ID чата: ${stream.chatId || 'не привязан'}`,
    `Команд с подпиской: ${teams.length}`,
    `Подтверждённых устройств: ${devices.length}`,
    `Цена за устройство: ${process.env.PROP_DEVICE_PRICE_RUB || 4000} ₽ или 40 USDT`,
    existing ? `Сбор для этой даты: ${existing.status}` : 'Сбор ещё не запускался',
    stream.status !== 'active' ? '⚠️ Поток закрыт' : '',
    stream.expiresAt!.getTime() <= Date.now() ? '⚠️ Дата окончания уже прошла' : '',
    !stream.chatId ? '⚠️ Чат для опроса не привязан' : '',
    !devices.length ? '⚠️ Нет подтверждённых устройств' : '',
    '',
    'Проверьте данные перед отправкой. После запуска условия этого сбора сохраняются.',
  ].join('\n')
  const kb = new InlineKeyboard()
  if ((!existing || existing.status === 'preparing') && stream.status === 'active' && stream.expiresAt!.getTime() > Date.now() && stream.chatId && devices.length) kb.text('📣 Отправить опрос в чат', `pr:a:launch:${flowNumber}`).row()
  if (existing?.status === 'active') kb.text('📊 Открыть текущий сбор', `pr:a:lists:${existing.id}`).row()
  kb.text('✏️ Редактировать поток', apCb('stream', flowNumber)).row()
  kb.text('‹ К списку потоков', apCb('streams'))
  await ctx.reply(text, { reply_markup: kb })
}

async function showAdminLists(ctx: any, campaignId: string) {
  await setRenewalSummaryView(ctx.api, campaignId, 'lists')
}

export async function handleRenewalCallback(ctx: any, data: string): Promise<boolean> {
  if (!data.startsWith('pr:')) return false
  const parts = data.split(':')
  try {
    if (parts[1] === 'a') {
      if (!(await hasAdminPermission(ctx.from.id, 'streams.edit'))) {
        await answer(ctx, 'Нет прав для управления потоками', true)
        return true
      }
      const action = parts[2]
      const value = parts[3]
      if (action === 'preview') await showAdminPreview(ctx, Number(value))
      else if (action === 'launch') {
        const campaign = await launchRenewal(ctx.api, Number(value), ctx.from.id)
        const saved = await getRenewalCampaign(campaign.id)
        await ctx.reply(`✅ Опрос потока №${campaign.flowNumber} отправлен.${saved?.summaryMessageId ? ' Сводка создана в теме статистики.' : ' Сводку пока не удалось опубликовать; проверьте доступ бота к теме 209.'}`)
      } else if (action === 'lists') await showAdminLists(ctx, value)
      else if (action === 'summary') await setRenewalSummaryView(ctx.api, value, 'summary')
      else if (action === 'convert') {
        await convertLegacyRenewal(ctx.api, value)
        await answer(ctx, 'Сбор пересчитан по устройствам')
      }
      else if (action === 'finish') {
        const campaign = await getRenewalCampaign(value)
        if (!campaign) throw new Error('Сбор не найден')
        const stats = renewalStats(await ProPresenterRenewalSeatModel.find({ campaignId: value }))
        const prompt = `Продлить поток №${campaign.flowNumber} на год? Подтверждено ${stats.paid}/${stats.total} взносов. Это изменит общую дату подписки.`
        const replyMarkup = new InlineKeyboard()
          .text('✅ Подтверждаю продление', `pr:a:finishok:${value}`).row()
          .text('Отмена', `pr:a:lists:${value}`)
        if (ctx.callbackQuery?.message?.message_id === campaign.summaryMessageId) {
          await ctx.editMessageText(prompt, { reply_markup: replyMarkup })
        } else {
          await ctx.reply(prompt, { reply_markup: replyMarkup })
        }
      } else if (action === 'finishok') {
        const next = await completeRenewal(ctx.api, value, ctx.from.id)
        await answer(ctx, `Поток продлён до ${next.toLocaleDateString('ru-RU')}`)
      } else if (action === 'refresh') {
        await syncRenewalSummary(ctx.api, value)
        await answer(ctx, 'Данные обновлены')
      }
      await answer(ctx)
      return true
    }

    const campaignId = parts[2]
    const campaign = await getRenewalCampaign(campaignId)
    if (!campaign || !renewalAcceptsNewPayments(campaign)) throw new Error('Этот сбор уже закрыт')
    if (parts[1] === 'v') {
      if (campaign.billingMode !== 'device') throw new Error('Сбор ещё не переведён на учёт устройств. Обратитесь к администратору')
      if (campaign.status !== 'active') throw new Error('Голосование завершено; оплату можно открыть в личке')
      if (ctx.chat?.id !== campaign.chatId) throw new Error('Этот опрос относится к другому чату')
      const seats = await eligibleSeats(campaignId, ctx.from.id)
      if (!seats.length) throw new Error('Голосовать может только владелец подписки команды этого потока')
      if (seats.length > 1) {
        const kb = new InlineKeyboard()
        for (const seat of seats) kb.text(seat.teamName.slice(0, 45), `pr:g:${campaignId}:${seat.teamId}:${parts[3] === 'n' ? 'n' : 'y'}`).row()
        try {
          await ctx.api.sendMessage(ctx.from.id, 'Выберите команду, за которую отвечаете:', { reply_markup: kb })
          await answer(ctx, 'Выберите команду в личном сообщении')
        } catch {
          await answer(ctx, 'Откройте личный чат с ботом, чтобы выбрать команду', true)
        }
        return true
      }
      if (parts[3] === 'n') {
        await declineTeamDevices(ctx.api, campaignId, seats[0].teamId, ctx.from.id)
        await answer(ctx, 'Ответ «не буду продлевать» записан для устройств команды')
      } else {
        try {
          await sendRenewalConfirmation(ctx.api, ctx.from.id, campaignId, seats[0].teamId, campaign.flowNumber)
          await answer(ctx, 'Подтвердите решение в личном сообщении')
        } catch { await answer(ctx, 'Откройте личный чат с ботом, чтобы продолжить', true) }
      }
      return true
    }
    if (ctx.chat?.type !== 'private') throw new Error('Продолжите в личном чате с ботом')
    if (parts[1] === 'g') {
      const seat = (await eligibleSeats(campaignId, ctx.from.id)).find((item) => item.teamId === parts[3])
      if (!seat) throw new Error('Команда больше не доступна вам')
      if (parts[4] === 'n') {
        await declineTeamDevices(ctx.api, campaignId, seat.teamId, ctx.from.id)
        await ctx.reply('Ответ «не буду продлевать» записан для устройств команды.')
      } else await sendRenewalConfirmation(ctx.api, ctx.from.id, campaignId, seat.teamId, campaign.flowNumber)
    } else if (parts[1] === 'y') {
      await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, parts[3], ctx.callbackQuery?.message?.message_id)
    } else if (parts[1] === 'n') {
      await declineTeamDevices(ctx.api, campaignId, parts[3], ctx.from.id)
      await ctx.editMessageText('Ответ «не буду продлевать» записан для устройств вашей команды. Вы можете вернуться к выбору позже через бота.')
    } else if (parts[1] === 'e') {
      const seats = await eligibleSeats(campaignId, ctx.from.id)
      const seat = seats.find((item) => item.teamId === parts[3])
      if (!seat) throw new Error('Команда больше не доступна вам')
      await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, seat.teamId, ctx.callbackQuery?.message?.message_id)
    } else if (parts[1] === 's') {
      const teamId = parts[3]
      await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, teamId, ctx.callbackQuery?.message?.message_id)
    } else if (parts[1] === 'd') {
      const seat = await voteForDevice(ctx.api, campaignId, parts[3], ctx.from.id, parts[4] === 't' ? 'toggle' : parts[4] === 'y' ? 'yes' : 'no')
      await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, seat.teamId, ctx.callbackQuery?.message?.message_id)
    } else if (parts[1] === 'c') {
      await startRenewalCheckout(ctx, campaignId, parts[3])
    } else if (parts[1] === 'p') {
      await sendDeviceChoices(ctx.api, ctx.from.id, campaignId, parts[3], ctx.callbackQuery?.message?.message_id)
    }
    await answer(ctx)
  } catch (error) {
    await answer(ctx, error instanceof Error ? error.message : 'Ошибка продления', true)
  }
  return true
}

export async function runRenewalAdminPrompts(api: Api) {
  const streams = await renewalPromptCandidates()
  if (!streams.length) return
  const admins = (await listAdminAccess()).filter((admin) => admin.active && admin.permissions.includes('streams.edit'))
  for (const stream of streams) for (const admin of admins) {
    const key = `renewal:30d:${stream.expiresAt!.toISOString()}:${admin.telegramId}`
    if (stream.adminReminders.includes(key)) continue
    try {
      await api.sendMessage(admin.telegramId,
        `📡 Пора начать сбор продления потока №${stream.flowNumber}.\nДата окончания: ${stream.expiresAt!.toLocaleDateString('ru-RU')}.\nПроверьте карточку и подтвердите отправку приглашения в чат.`, {
          reply_markup: new InlineKeyboard()
            .text('📣 Начать сбор', `pr:a:preview:${stream.flowNumber}`).row()
            .text('✏️ Редактировать поток', apCb('stream', stream.flowNumber)),
        })
      stream.adminReminders.push(key)
      await stream.save()
    } catch (error) {
      console.error(`Renewal admin prompt failed for ${admin.telegramId}:`, error)
    }
  }
}

export async function runRenewalParticipantReminders(api: Api) {
  const campaigns = await ProPresenterRenewalCampaignModel.find({ status: 'active' })
  for (const campaign of campaigns) {
    await syncRenewalPollKeyboard(api, campaign).catch((error) =>
      console.error(`Renewal poll keyboard update failed for flow ${campaign.flowNumber}:`, error))
    const seats = await ProPresenterRenewalSeatModel.find({ campaignId: campaign._id })
    const daysLeft = Math.ceil((campaign.cycleEndsAt.getTime() - Date.now()) / DAY_MS)
    for (const seat of seats) {
      const team = await TeamModel.findById(seat.teamId)
      const sub = team?.subscriptions.get('propresenter')
      if (!team || (campaign.billingMode === 'device'
        ? !seat.devices.length
        : !['active', 'expired'].includes(sub?.status || '') || Number((sub?.meta as any)?.flowNumber) !== campaign.flowNumber)) continue
      if (seat.ownerId !== team.ownerId) {
        seat.ownerId = team.ownerId
        seat.teamName = team.name
        await seat.save()
      }
      const planned = campaign.billingMode === 'device' ? seat.devices.filter((device) => device.active !== false && device.vote === 'yes' && device.paymentStatus === 'none') : []
      if (campaign.billingMode === 'device' && !planned.length) continue
      if (campaign.billingMode !== 'device' && (seat.vote !== 'yes' || seat.paymentStatus !== 'none')) continue
      const votedAt = campaign.billingMode === 'device' ? Math.min(...planned.map((device) => device.votedAt?.getTime() || Date.now())) : seat.votedAt?.getTime() || campaign.startedAt?.getTime() || Date.now()
      const threeDaysPassed = Date.now() - votedAt >= 3 * DAY_MS
      const due = seat.reminderCount === 0 ? threeDaysPassed : seat.reminderCount === 1 && daysLeft <= 7
      if (!due || (seat.lastReminderAt && Date.now() - seat.lastReminderAt.getTime() < DAY_MS)) continue
      try {
        const username = (await api.getMe()).username
        const unpaid = campaign.billingMode === 'device' ? planned.length : 1
        await api.sendMessage(seat.ownerId,
          `🔔 Вы планировали продлить ProPresenter, поток №${campaign.flowNumber}, команда «${seat.teamName}». Ожидают оплату: ${unpaid} устройств.`, {
            reply_markup: new InlineKeyboard().url('💳 Перейти к оплате', renewalStartLink(username, campaign.id)),
          })
        seat.reminderCount += 1
      } catch (error) {
        console.error(`Renewal reminder failed for ${seat.ownerId}:`, error)
      }
      seat.lastReminderAt = new Date()
      await seat.save()
    }
  }
}
