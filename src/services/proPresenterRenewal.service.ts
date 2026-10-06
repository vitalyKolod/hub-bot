import { InlineKeyboard, type Api } from 'grammy'
import { Types } from 'mongoose'
import { getProduct } from '../config/products.js'
import { TeamModel } from '../models/Team.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { ProPresenterRenewalCampaignModel, ProPresenterRenewalSeatModel } from '../models/ProPresenterRenewal.js'
import { ProPresenterDeviceModel } from '../models/ProPresenterDevice.js'
import { PaymentModel } from '../models/Payment.js'
import { adminSetStreamExpiry } from './adminPanel.service.js'

export const PROP_RENEWAL_STATS_THREAD_ID = Number(process.env.PROP_RENEWAL_STATS_THREAD_ID || 209)
const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID)
const DAY_MS = 86_400_000

export function renewalAcceptsNewPayments(campaign: { status: string; completedAt?: Date | null }) {
  return campaign.status === 'active' ||
    (campaign.status === 'completed' && !!campaign.completedAt && Date.now() - campaign.completedAt.getTime() <= 30 * DAY_MS)
}

export function renewalStartLink(botUsername: string, campaignId: string) {
  return `https://t.me/${botUsername}?start=pr_${campaignId}`
}

export function renewalPollKeyboard(campaignId: string) {
  return new InlineKeyboard()
    .text('👍 Да, буду продлевать', `pr:v:${campaignId}:y`)
    .text('👎 Нет, не буду', `pr:v:${campaignId}:n`)
}

function renewalPollText(flowNumber: number, cycleEndsAt: Date) {
  return `📡 Поток ProPresenter №${flowNumber}\nПодписка действует до ${cycleEndsAt.toLocaleDateString('ru-RU')}.\n\nБудете продлевать? Ответить и оплатить может только владелец команды. После ответа «Да» бот уточнит решение и предложит выбрать устройства в личном чате.`
}

export async function syncRenewalPollKeyboard(api: Api, campaign: any) {
  if (campaign.billingMode !== 'device' || !campaign.groupMessageId || campaign.pollButtonsVersion === 4) return
  await api.editMessageText(campaign.chatId, campaign.groupMessageId, renewalPollText(campaign.flowNumber, campaign.cycleEndsAt), {
    reply_markup: renewalPollKeyboard(campaign.id),
  })
  campaign.pollButtonsVersion = 4
  await campaign.save()
}

export async function bindStreamChat(flowNumber: number, chatId: number) {
  if (!Number.isSafeInteger(flowNumber) || flowNumber <= 0 || !Number.isSafeInteger(chatId) || chatId >= 0) {
    throw new Error('Некорректный номер потока или ID группового чата')
  }
  const other = await ProPresenterStreamModel.findOne({ chatId, flowNumber: { $ne: flowNumber } })
  if (other) throw new Error(`Этот чат уже привязан к потоку №${other.flowNumber}`)
  const stream = await ProPresenterStreamModel.findOneAndUpdate({ flowNumber }, { $set: { chatId } }, { new: true })
  if (!stream) throw new Error('Поток не найден в админке')
  return stream
}

export async function renewalPreview(flowNumber: number) {
  const stream = await ProPresenterStreamModel.findOne({ flowNumber })
  if (!stream) throw new Error('Поток не найден')
  if (!stream.expiresAt) throw new Error('Сначала укажите дату окончания потока')
  const devices = await ProPresenterDeviceModel.find({ flowNumber, status: 'active' })
  const teams = await TeamModel.find({ _id: { $in: devices.map((device) => device.teamId) } }).sort({ name: 1 })
  const product = getProduct('propresenter')
  if (!product?.priceRub || !product?.priceUsd) throw new Error('Не настроена стоимость ProPresenter')
  const existing = await ProPresenterRenewalCampaignModel.findOne({ flowNumber, cycleEndsAt: stream.expiresAt })
  return { stream, teams, devices, product, existing }
}

function renewalTargetDate(campaign: { cycleEndsAt: Date; targetEndsAt?: Date | null; startedAt?: Date | null }) {
  if (campaign.targetEndsAt) return campaign.targetEndsAt
  const next = new Date(Math.max(campaign.cycleEndsAt.getTime(), campaign.startedAt?.getTime() || Date.now()))
  next.setFullYear(next.getFullYear() + 1)
  return next
}

export async function reconcileRenewalDevices(campaign: any) {
  if (campaign.billingMode !== 'device') return
  const devices = await ProPresenterDeviceModel.find({ flowNumber: campaign.flowNumber, status: 'active' })
  const teamIds = [...new Set(devices.map((device) => device.teamId))]
  const teams = await TeamModel.find({ _id: { $in: teamIds } })
  const target = renewalTargetDate(campaign)
  const activeIds = new Set<string>()
  for (const team of teams) {
    const teamId = String(team._id)
    const owned = devices.filter((device) => device.teamId === teamId)
    if (!owned.length) continue
    activeIds.add(teamId)
    let seat = await ProPresenterRenewalSeatModel.findOne({ campaignId: campaign._id, teamId })
    if (!seat) seat = new ProPresenterRenewalSeatModel({ campaignId: campaign._id, teamId, teamName: team.name, ownerId: team.ownerId })
    const previous = new Map((seat.devices || []).map((state: any) => [state.deviceId, state]))
    const current = owned.map((device) => {
      const state: any = previous.get(device.id)
      return state ? { ...(state.toObject?.() || state), name: device.name, active: true } : { deviceId: device.id, name: device.name, active: true, vote: 'none',
        paymentStatus: device.paidThrough && device.paidThrough >= target ? 'paid' : 'none',
        paidAt: device.paidThrough && device.paidThrough >= target ? new Date() : undefined }
    })
    seat.devices = [...current, ...(seat.devices || []).filter((state: any) => !owned.some((device) => device.id === state.deviceId)).map((state: any) => ({ ...(state.toObject?.() || state), active: false }))] as any
    const activeDevices = seat.devices.filter((device: any) => device.active !== false)
    seat.paymentStatus = activeDevices.length && activeDevices.every((device: any) => device.paymentStatus === 'paid') ? 'paid' :
      activeDevices.some((device: any) => device.paymentStatus === 'pending') ? 'pending' : 'none'
    seat.teamName = team.name
    seat.ownerId = team.ownerId
    await seat.save()
  }
  await ProPresenterRenewalSeatModel.updateMany({ campaignId: campaign._id, teamId: { $nin: [...activeIds] } }, { $set: { 'devices.$[].active': false } })
}

export async function getRenewalCampaign(campaignId: string) {
  if (!Types.ObjectId.isValid(campaignId)) return null
  return ProPresenterRenewalCampaignModel.findById(campaignId)
}

export async function getActiveRenewalForFlow(flowNumber: number) {
  return ProPresenterRenewalCampaignModel.findOne({ flowNumber, status: 'active' }).sort({ createdAt: -1 })
}

export async function getPayableRenewalForFlow(flowNumber: number) {
  const campaigns = await ProPresenterRenewalCampaignModel.find({ flowNumber, status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).limit(2)
  return campaigns.find(renewalAcceptsNewPayments) || null
}

export async function launchRenewal(api: Api, flowNumber: number, adminId: number) {
  const { stream, teams, devices, existing } = await renewalPreview(flowNumber)
  const cycleEndsAt = stream.expiresAt
  if (!cycleEndsAt) throw new Error('Дата окончания потока не задана')
  if (stream.status !== 'active') throw new Error('Поток закрыт. Откройте его перед запуском сбора')
  if (cycleEndsAt.getTime() <= Date.now()) throw new Error('Дата окончания уже прошла. Проверьте дату потока')
  if (!stream.chatId) throw new Error('Чат потока не привязан. Выполните /bind_stream в чате потока.')
  if (!teams.length || !devices.length) throw new Error('Сначала добавьте и подтвердите устройства этого потока')
  const priceRub = Number(process.env.PROP_DEVICE_PRICE_RUB || 4000)
  if (!Number.isFinite(priceRub) || priceRub <= 0) throw new Error('Укажите PROP_DEVICE_PRICE_RUB — цену одного устройства в рублях')
  if (existing?.status === 'active' || existing?.status === 'completed') {
    throw new Error('Сбор для этой даты уже запускался')
  }
  const conflicting = await getActiveRenewalForFlow(flowNumber)
  if (conflicting && String(conflicting._id) !== String(existing?._id)) {
    throw new Error('Для потока уже открыт другой сбор. Завершите его перед новым запуском.')
  }
  const campaign = existing || await ProPresenterRenewalCampaignModel.create({
    flowNumber, cycleEndsAt, chatId: stream.chatId,
    priceRub, priceUsd: 40, billingMode: 'device',
    startedBy: adminId,
  })
  if (campaign.billingMode !== 'device') {
    campaign.billingMode = 'device'
    campaign.priceRub = priceRub
    campaign.priceUsd = 40
    await campaign.save()
  }
  await reconcileRenewalDevices(campaign)
  if (!campaign.groupMessageId) {
    const kb = renewalPollKeyboard(campaign.id)
    const sent = await api.sendMessage(stream.chatId,
      renewalPollText(flowNumber, cycleEndsAt),
      { reply_markup: kb })
    campaign.groupMessageId = sent.message_id
    campaign.pollButtonsVersion = 4
  } else {
    await syncRenewalPollKeyboard(api, campaign)
  }
  campaign.status = 'active'
  campaign.startedAt ||= new Date()
  await campaign.save()
  await syncRenewalSummary(api, campaign.id).catch((error) => console.error('Renewal summary creation failed:', error))
  return campaign
}

export async function convertLegacyRenewal(api: Api, campaignId: string) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || campaign.status !== 'active') throw new Error('Активный сбор не найден')
  if (campaign.billingMode === 'device') return campaign
  const priceRub = Number(process.env.PROP_DEVICE_PRICE_RUB || 4000)
  if (!Number.isFinite(priceRub) || priceRub <= 0) throw new Error('Сначала укажите цену устройства PROP_DEVICE_PRICE_RUB')
  if (!await ProPresenterDeviceModel.exists({ flowNumber: campaign.flowNumber, status: 'active' })) {
    throw new Error('Сначала добавьте устройства в этот поток')
  }
  if (await PaymentModel.exists({ renewalCampaignId: campaignId, status: { $in: ['pending', 'processing', 'accepted'] } })) {
    throw new Error('В этом сборе уже есть платежи. Сначала нужно вручную сопоставить их с устройствами')
  }
  campaign.billingMode = 'device'
  campaign.priceRub = priceRub
  campaign.priceUsd = 40
  await campaign.save()
  await reconcileRenewalDevices(campaign)
  await syncRenewalPollKeyboard(api, campaign)
  await syncRenewalSummary(api, campaignId)
  return campaign
}

export async function eligibleSeats(campaignId: string, telegramId: number) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || !renewalAcceptsNewPayments(campaign)) return []
  await reconcileRenewalDevices(campaign)
  const seats = await ProPresenterRenewalSeatModel.find({ campaignId: campaign._id })
  const candidates = await TeamModel.find({ _id: { $in: seats.map((seat) => seat.teamId) }, ownerId: telegramId })
  const currentTeams = new Map(candidates.map((team) => [String(team._id), team]))
  const teamIds = new Set(candidates.filter((team) => {
    const sub = team.subscriptions.get('propresenter')
    return campaign.billingMode === 'device'
      ? seats.some((seat) => seat.teamId === String(team._id) && seat.devices.some((device) => device.active !== false))
      : ['active', 'expired'].includes(sub?.status || '') && Number((sub?.meta as any)?.flowNumber) === campaign.flowNumber
  }).map((team) => String(team._id)))
  const eligible = seats.filter((seat) => teamIds.has(seat.teamId))
  for (const seat of eligible) {
    const team = currentTeams.get(seat.teamId)!
    if (seat.ownerId !== team.ownerId || seat.teamName !== team.name) {
      seat.ownerId = team.ownerId
      seat.teamName = team.name
      await seat.save()
    }
  }
  return eligible
}

export async function voteForSeat(api: Api, campaignId: string, teamId: string, telegramId: number, vote: 'yes' | 'no') {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || campaign.status !== 'active') throw new Error('Этот опрос уже закрыт')
  const seats = await eligibleSeats(campaignId, telegramId)
  const seat = seats.find((item) => item.teamId === teamId)
  if (!seat) throw new Error('Голосовать может только владелец подписки этой команды')
  if (seat.paymentStatus === 'paid') throw new Error('Оплата уже подтверждена; голос менять нельзя')
  if (seat.vote !== vote) {
    seat.vote = vote
    seat.votedAt = new Date()
    await seat.save()
    await syncRenewalSummary(api, campaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  return seat
}

export async function voteForDevice(api: Api, campaignId: string, deviceId: string, telegramId: number, vote: 'yes' | 'no' | 'none' | 'toggle') {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || !renewalAcceptsNewPayments(campaign) || campaign.billingMode !== 'device') throw new Error('Выбор устройств для этого потока закрыт')
  const seats = await eligibleSeats(campaignId, telegramId)
  const seat = seats.find((item) => item.devices.some((device) => device.deviceId === deviceId && device.active !== false))
  if (!seat) throw new Error('Устройство не закреплено за вашей командой в этом потоке')
  const device = seat.devices.find((item) => item.deviceId === deviceId)!
  if (device.paymentStatus !== 'none') throw new Error('По устройству уже есть чек или подтверждена оплата')
  const nextVote = vote === 'toggle' ? device.vote === 'yes' ? 'none' : 'yes' : vote
  if (device.vote !== nextVote) {
    device.vote = nextVote
    device.votedAt = new Date()
    if (nextVote === 'yes') {
      seat.reminderCount = 0
      seat.lastReminderAt = null
    }
    await seat.save()
    await syncRenewalSummary(api, campaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  return seat
}

export async function declineTeamDevices(api: Api, campaignId: string, teamId: string, telegramId: number) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || campaign.status !== 'active' || campaign.billingMode !== 'device') throw new Error('Этот опрос уже закрыт')
  const seat = (await eligibleSeats(campaignId, telegramId)).find((item) => item.teamId === teamId)
  if (!seat) throw new Error('Ответить может только владелец команды')
  let changed = false
  for (const device of seat.devices) {
    if (device.active === false || device.paymentStatus !== 'none' || device.vote === 'no') continue
    device.vote = 'no'
    device.votedAt = new Date()
    changed = true
  }
  if (changed) {
    await seat.save()
    await syncRenewalSummary(api, campaignId).catch((error) => console.error('Renewal summary update failed:', error))
  }
  return seat
}

export async function getRenewalSeat(campaignId: string, teamId: string) {
  if (!Types.ObjectId.isValid(campaignId)) return null
  return ProPresenterRenewalSeatModel.findOne({ campaignId, teamId })
}

export async function setRenewalPaymentStatus(campaignId: string, teamId: string, paymentId: string, status: 'pending' | 'paid' | 'none', deviceIds?: string[]) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign) throw new Error('Сбор продления не найден')
  const seat = await ProPresenterRenewalSeatModel.findOne({ campaignId, teamId })
  if (!seat) throw new Error('Команда отсутствует в сборе продления')
  // Чек, отправленный до завершения общего продления, администратор может
  // подтвердить и позже. Общая дата от этого не меняется.
  if (status === 'paid' && !['active', 'completed'].includes(campaign.status)) throw new Error('Сбор продления уже закрыт')
  if (campaign.billingMode === 'device') {
    if (!deviceIds?.length) throw new Error('Не указаны устройства оплаты')
    const selected = new Set(deviceIds)
    if (seat.devices.filter((device) => device.active !== false && selected.has(device.deviceId || '')).length !== selected.size) {
      throw new Error('Состав устройств изменился. Проверьте платёж вручную')
    }
    for (const device of seat.devices) {
      if (!selected.has(device.deviceId || '')) continue
      if (status === 'pending' && device.paymentStatus !== 'none' && !(device.paymentStatus === 'pending' && device.paymentId === paymentId)) throw new Error('По устройству уже есть платёж')
      if (status === 'paid' && !((device.paymentStatus === 'pending' || device.paymentStatus === 'paid') && device.paymentId === paymentId)) throw new Error('Чек устройства не совпадает с ожидающим платежом')
      if (status === 'none' && (device.paymentStatus !== 'pending' || device.paymentId !== paymentId)) throw new Error('Чек устройства уже обработан')
    }
    for (const device of seat.devices) {
      if (!selected.has(device.deviceId || '')) continue
      device.paymentStatus = status
      device.paymentId = status === 'none' ? undefined : paymentId
      if (status === 'paid') device.paidAt = new Date()
    }
    const active = seat.devices.filter((device) => device.active !== false)
    seat.paymentStatus = active.length && active.every((device) => device.paymentStatus === 'paid') ? 'paid' :
      active.some((device) => device.paymentStatus === 'pending') ? 'pending' : 'none'
    await seat.save()
    if (status === 'paid') {
      await ProPresenterDeviceModel.updateMany({ _id: { $in: deviceIds } }, { $max: { paidThrough: renewalTargetDate(campaign) } })
    }
    return seat
  }
  if (seat.paymentStatus === 'paid' && status !== 'paid') return seat
  seat.paymentStatus = status
  seat.paymentId = status === 'none' ? null : paymentId
  if (status === 'paid') seat.paidAt = new Date()
  await seat.save()
  return seat
}

export function renewalStats(seats: Array<{ vote: string; paymentStatus: string; devices?: Array<{ active?: boolean; vote?: string; paymentStatus: string }> }>) {
  const items = seats.flatMap((seat) => seat.devices ? seat.devices.filter((device) => device.active !== false).map((device) => ({ vote: device.vote || 'none', paymentStatus: device.paymentStatus })) : [seat])
  const paid = items.filter((item) => item.paymentStatus === 'paid').length
  const pending = items.filter((item) => item.paymentStatus === 'pending').length
  const yes = items.filter((item) => item.paymentStatus === 'none' && item.vote === 'yes').length
  const no = items.filter((item) => item.paymentStatus === 'none' && item.vote === 'no').length
  const silent = items.length - paid - pending - yes - no
  return { total: items.length, paid, yes, no, silent, pending }
}

export function renewalListsText(campaign: { flowNumber: number }, seats: Array<{ teamName: string; ownerId: number; vote: string; paymentStatus: string; devices?: Array<{ name?: string | null; active?: boolean; vote?: string; paymentStatus: string }> }>) {
  const items = seats.flatMap((seat) => seat.devices ? seat.devices.filter((device) => device.active !== false).map((device) => ({ ...seat, vote: device.vote || 'none', paymentStatus: device.paymentStatus, label: `${device.name} · ${seat.teamName}` })) : [{ ...seat, label: seat.teamName }])
  const group = (predicate: (seat: typeof items[number]) => boolean) => items.filter(predicate)
    .map((seat) => `• ${seat.label} · ID ${seat.ownerId}`).join('\n') || '—'
  return [
    `📡 Поток №${campaign.flowNumber} · списки`,
    '',
    '💸 Оплачено:', group((seat) => seat.paymentStatus === 'paid'),
    '',
    '🧾 Чек на проверке:', group((seat) => seat.paymentStatus === 'pending'),
    '',
    '👍 Продлевают, ждём оплату:', group((seat) => seat.paymentStatus === 'none' && seat.vote === 'yes'),
    '',
    '👎 Не продлевают:', group((seat) => seat.paymentStatus === 'none' && seat.vote === 'no'),
    '',
    '🤷 Без ответа:', group((seat) => seat.paymentStatus === 'none' && seat.vote === 'none'),
  ].join('\n').slice(0, 4000)
}

export async function setRenewalSummaryView(api: Api, campaignId: string, view: 'summary' | 'lists') {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign?.summaryMessageId) throw new Error('Сообщение статистики не найдено')
  const previousView = campaign.summaryView
  campaign.summaryView = view
  await campaign.save()
  try {
    return await syncRenewalSummary(api, campaignId, false)
  } catch (error) {
    campaign.summaryView = previousView
    await campaign.save()
    throw error
  }
}

export async function syncRenewalSummary(api: Api, campaignId: string, allowRecreate = true) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || !ADMIN_GROUP_ID || !PROP_RENEWAL_STATS_THREAD_ID) return null
  await reconcileRenewalDevices(campaign)
  const seats = await ProPresenterRenewalSeatModel.find({ campaignId })
  const stats = renewalStats(seats)
  const summaryText = [
    `📡 ProPresenter · поток №${campaign.flowNumber}`,
    `Период: до ${campaign.cycleEndsAt.toLocaleDateString('ru-RU')}`,
    `Статус сбора: ${campaign.status === 'completed' ? 'завершён' : 'идёт'}`,
    `Устройств в сборе: ${stats.total}`,
    '',
    `💸 Оплачено: ${stats.paid}/${stats.total}`,
    `👍 Продлевают, ждём оплату: ${stats.yes}/${stats.total}`,
    `👎 Не продлевают: ${stats.no}/${stats.total}`,
    `🤷 Без ответа: ${stats.silent}/${stats.total}`,
    `🧾 Устройств с чеком на проверке: ${stats.pending}`,
  ].join('\n')
  const listsView = campaign.summaryView === 'lists'
  const text = listsView ? renewalListsText(campaign, seats) : summaryText
  const kb = listsView
    ? new InlineKeyboard()
      .text('‹ К сводке', `pr:a:summary:${campaign.id}`).row()
      .text('🔄 Обновить', `pr:a:refresh:${campaign.id}`)
    : new InlineKeyboard().text('👥 Списки', `pr:a:lists:${campaign.id}`)
  if (listsView && campaign.status === 'active') {
    kb.row().text('✅ Подтвердить продление всего потока', `pr:a:finish:${campaign.id}`)
  }
  if (listsView && campaign.billingMode !== 'device' && campaign.status === 'active') {
    kb.row().text('🖥 Перейти на учёт устройств', `pr:a:convert:${campaign.id}`)
  }
  if (campaign.summaryMessageId) {
    try {
      await api.editMessageText(ADMIN_GROUP_ID, campaign.summaryMessageId, text, { reply_markup: kb })
      return stats
    } catch (error) {
      if (String((error as any)?.description || error).includes('message is not modified')) return stats
      if (!allowRecreate) throw error
    }
  }
  const message = await api.sendMessage(ADMIN_GROUP_ID, text, {
    message_thread_id: PROP_RENEWAL_STATS_THREAD_ID, reply_markup: kb,
  })
  campaign.summaryMessageId = message.message_id
  await campaign.save()
  return stats
}

export async function completeRenewal(api: Api, campaignId: string, adminId: number) {
  const campaign = await getRenewalCampaign(campaignId)
  if (!campaign || campaign.status !== 'active') throw new Error('Активный сбор не найден')
  const stream = await ProPresenterStreamModel.findOne({ flowNumber: campaign.flowNumber })
  if (!stream) throw new Error('Поток не найден')
  if (!campaign.targetEndsAt && stream.expiresAt?.getTime() !== campaign.cycleEndsAt.getTime()) {
    throw new Error('Дата потока изменилась после запуска сбора; проверьте её в карточке потока')
  }
  if (!campaign.targetEndsAt) {
    const next = new Date(Math.max(stream.expiresAt!.getTime(), Date.now()))
    next.setFullYear(next.getFullYear() + 1)
    campaign.targetEndsAt = next
    await campaign.save()
  }
  const next = campaign.targetEndsAt
  if (stream.expiresAt?.getTime() !== campaign.cycleEndsAt.getTime() && stream.expiresAt?.getTime() !== next.getTime()) {
    throw new Error('Дата потока изменена вручную. Проверьте её перед завершением сбора')
  }
  await adminSetStreamExpiry(campaign.flowNumber, next, adminId)
  campaign.status = 'completed'
  campaign.completedAt = new Date()
  await campaign.save()
  await syncRenewalSummary(api, campaign.id).catch((error) => console.error('Renewal summary update failed:', error))
  return next
}

export async function renewalPromptCandidates() {
  const now = new Date()
  const streams = await ProPresenterStreamModel.find({ status: 'active', expiresAt: { $gt: now, $lte: new Date(now.getTime() + 30 * DAY_MS) } })
  const active = await ProPresenterRenewalCampaignModel.find({ status: 'active', flowNumber: { $in: streams.map((s) => s.flowNumber) } })
  const activeFlows = new Set(active.map((campaign) => campaign.flowNumber))
  return streams.filter((stream) => !activeFlows.has(stream.flowNumber))
}
