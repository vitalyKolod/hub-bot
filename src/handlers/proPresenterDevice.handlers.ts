import { InlineKeyboard } from 'grammy'
import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { apCb } from '../constants/admin-panel.js'
import { showAdminTeamCard } from './adminPanel.handlers.js'
import { hasAdminPermission } from '../services/adminAccess.service.js'
import { TeamModel } from '../models/Team.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import {
  ProPresenterDeviceModel,
  ProPresenterDeviceRequestModel,
} from '../models/ProPresenterDevice.js'
import { ProPresenterRenewalCampaignModel } from '../models/ProPresenterRenewal.js'
import { syncRenewalSummary } from '../services/proPresenterRenewal.service.js'
import {
  applyDeviceChange,
  availableDeviceFlows,
  createApprovedDevice,
  createDeviceRequest,
  decideDeviceRequest,
  DEVICE_ICON,
  DEVICE_REQUEST_THREAD_ID,
  listFlowDevices,
} from '../services/proPresenterDevice.service.js'

type Draft = {
  mode: 'user_name' | 'admin_name'
  teamId: string
  flowNumber: number
  name?: string
  adminMessageId?: number
}
const adminGroupId = Number(process.env.ADMIN_GROUP_ID)

async function syncAffectedRenewals(api: any, flows: Array<number | null | undefined>) {
  const campaigns = await ProPresenterRenewalCampaignModel.find({
    status: 'active',
    flowNumber: { $in: [...new Set(flows.filter((flow): flow is number => Boolean(flow)))] },
  })
  for (const campaign of campaigns) {
    await syncRenewalSummary(api, campaign.id).catch((error) =>
      console.error(`Device renewal summary failed for flow ${campaign.flowNumber}:`, error)
    )
  }
}

async function showUser(
  ctx: any,
  teamId: string,
  step: string = 'home',
  extra: Record<string, unknown> = {}
) {
  const params = { teamId, step, ...extra }
  goTo(ctx.from.id, 'devices', params)
  await renderScreen(ctx, ctx.from.id, 'devices', params)
}

async function showAdminFlow(ctx: any, flowNumber: number, page = 0) {
  const stream = await ProPresenterStreamModel.findOne({ flowNumber })
  if (!stream) throw new Error('Поток не найден')
  const devices = await listFlowDevices(flowNumber)
  const pages = Math.max(1, Math.ceil(devices.length / 20))
  const safePage = Math.min(Math.max(0, page), pages - 1)
  const visible = devices.slice(safePage * 20, (safePage + 1) * 20)
  const teams = await TeamModel.find({ _id: { $in: visible.map((item) => item.teamId) } })
  const teamNames = new Map(teams.map((team) => [String(team._id), team.name]))
  const text = [
    `🖥 Устройства · поток №${flowNumber}`,
    `Подтверждено: ${devices.length}`,
    '',
    ...visible.map(
      (device) => `• ${device.name} — ${teamNames.get(device.teamId) || 'команда удалена'}`
    ),
  ]
    .join('\n')
    .slice(0, 4000)
  const kb = new InlineKeyboard()
  for (const device of visible)
    kb.text(device.name.slice(0, 48), `dv:ad:${device.id}`).icon(DEVICE_ICON).row()
  if (pages > 1) {
    if (safePage > 0) kb.text('‹ Пред.', `dv:admin:${flowNumber}:${safePage - 1}`)
    kb.text(`${safePage + 1}/${pages}`, `dv:admin:${flowNumber}:${safePage}`)
    if (safePage < pages - 1) kb.text('След. ›', `dv:admin:${flowNumber}:${safePage + 1}`)
    kb.row()
  }
  kb.text('Добавить устройство', `dv:aa:${flowNumber}`).icon(DEVICE_ICON).row()
  kb.text('‹ К потоку', apCb('stream', flowNumber))
  await ctx.editMessageText(text, { reply_markup: kb })
}

async function showAdminDevice(ctx: any, deviceId: string) {
  const device = await ProPresenterDeviceModel.findById(deviceId)
  if (!device || device.status !== 'active') throw new Error('Устройство не найдено')
  const team = await TeamModel.findById(device.teamId)
  const kb = new InlineKeyboard()
    .text('Перенести', `dv:am:${device.id}`)
    .icon(DEVICE_ICON)
    .row()
    .text('Отказ от устройства', `dv:ar:${device.id}`)
    .icon(DEVICE_ICON)
    .row()
    .text('Открыть команду', apCb('t', device.teamId))
    .row()
    .text('‹ К устройствам потока', `dv:admin:${device.flowNumber}`)
  await ctx.editMessageText(
    `🖥 ${device.name}\nПоток №${device.flowNumber}\nКоманда: ${team?.name || '—'}\nСтатус: активное`,
    { reply_markup: kb }
  )
}

async function notifyAdmins(ctx: any, request: any) {
  if (!adminGroupId || !DEVICE_REQUEST_THREAD_ID)
    throw new Error('Не настроена тема заявок на устройства')
  const team = await TeamModel.findById(request.teamId)
  const action =
    request.action === 'add'
      ? request.replacesDeviceId
        ? 'Замена'
        : 'Добавление'
      : request.action === 'move'
        ? 'Перенос'
        : 'Отказ'
  const currentCount = await ProPresenterDeviceModel.countDocuments({
    teamId: request.teamId,
    flowNumber: request.toFlow || request.fromFlow,
    status: 'active',
  })
  const replaced = request.replacesDeviceId
    ? await ProPresenterDeviceModel.findById(request.replacesDeviceId)
    : null
  const countLine =
    request.action === 'add'
      ? `Устройств команды в потоке: ${currentCount} → ${currentCount + (replaced ? 0 : 1)}\n`
      : ''
  const text = `🖥 Заявка на устройство · ${action}\n\nКоманда: ${team?.name || request.teamId}\nВладелец: ${request.requestedBy}\nУстройство: ${request.deviceName}\n${replaced ? `Заменяет: ${replaced.name}\n` : ''}${countLine}Текущий поток: ${request.fromFlow ? `№${request.fromFlow}` : '—'}\nЦелевой поток: ${request.toFlow ? `№${request.toFlow}` : '—'}\nСтатус: ⏳ на проверке`
  const kb = new InlineKeyboard()
    .text('✅ Подтвердить', `dv:approve:${request.id}`)
    .row()
    .text('❌ Отклонить', `dv:reject:${request.id}`)
    .row()
    .url('👤 Профиль Telegram', `tg://user?id=${request.requestedBy}`)
    .row()
    .text('👥 Открыть команду', `dv:team:${request.teamId}`)
  const sent = await ctx.api.sendMessage(adminGroupId, text, {
    message_thread_id: DEVICE_REQUEST_THREAD_ID,
    reply_markup: kb,
  })
  request.adminMessageId = sent.message_id
  await request.save()
}

async function submitRequest(ctx: any, input: Parameters<typeof createDeviceRequest>[0]) {
  const request = await createDeviceRequest(input)
  try {
    await notifyAdmins(ctx, request)
  } catch (error) {
    await ProPresenterDeviceRequestModel.deleteOne({ _id: request._id, status: 'pending' })
    throw error
  }
  await showUser(ctx, input.teamId)
  await ctx.answerCallbackQuery({ text: 'Заявка отправлена на проверку' }).catch(() => {})
}

export async function handleDeviceCallback(ctx: any, data: string): Promise<boolean> {
  if (!data.startsWith('dv:')) return false
  const [_, action, first, second, third] = data.split(':')
  try {
    if (!['ac', 'axs', 'ax', 'axc', 'at'].includes(action)) ctx.session.deviceDraft = undefined
    if (action === 'team') {
      if (!(await hasAdminPermission(ctx.from.id, 'teams.view')))
        throw new Error('Нет прав на просмотр команды')
      await showAdminTeamCard(ctx, first)
      await ctx.answerCallbackQuery()
      return true
    }
    if (['approve', 'reject'].includes(action)) {
      if (
        ctx.chat?.id !== adminGroupId ||
        !(await hasAdminPermission(ctx.from.id, 'requests.edit'))
      )
        throw new Error('Нет прав на подтверждение заявок')
      const request = await decideDeviceRequest(first, ctx.from.id, action === 'approve')
      if (action === 'approve')
        await syncAffectedRenewals(ctx.api, [request.fromFlow, request.toFlow])
      const team = await TeamModel.findById(request.teamId)
      await ctx.editMessageText(
        `🖥 ${request.deviceName}\nКоманда: ${team?.name || request.teamId}\n${action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено'} администратором ${ctx.from.id}`,
        {
          reply_markup: new InlineKeyboard()
            .url('👤 Профиль Telegram', `tg://user?id=${request.requestedBy}`)
            .row()
            .text('👥 Открыть команду', `dv:team:${request.teamId}`),
        }
      )
      await ctx.api
        .sendMessage(
          request.requestedBy,
          `🖥 Заявка по устройству «${request.deviceName}» ${action === 'approve' ? 'подтверждена' : 'отклонена'}. Чтобы вернуться - нажмите /team_list`
        )
        .catch(() => {})
      await ctx.answerCallbackQuery()
      return true
    }

    if (['admin', 'aa', 'at', 'ad', 'am', 'atf', 'amc', 'ar', 'arc'].includes(action)) {
      if (!(await hasAdminPermission(ctx.from.id, 'streams.edit')))
        throw new Error('Нет прав для управления устройствами')
      if (action === 'admin') await showAdminFlow(ctx, Number(first), Number(second) || 0)
      else if (action === 'aa') {
        const teams = await TeamModel.find({
          'subscriptions.propresenter.meta.flowNumber': Number(first),
        }).sort({ name: 1 })
        const page = Number(second) || 0
        const pages = Math.max(1, Math.ceil(teams.length / 20))
        const safePage = Math.min(Math.max(0, page), pages - 1)
        const kb = new InlineKeyboard()
        for (const team of teams.slice(safePage * 20, (safePage + 1) * 20))
          kb.text(team.name.slice(0, 55), `dv:at:${first}:${team.id}`).icon(DEVICE_ICON).row()
        if (pages > 1) {
          if (safePage > 0) kb.text('‹ Пред.', `dv:aa:${first}:${safePage - 1}`)
          kb.text(`${safePage + 1}/${pages}`, `dv:aa:${first}:${safePage}`)
          if (safePage < pages - 1) kb.text('След. ›', `dv:aa:${first}:${safePage + 1}`)
          kb.row()
        }
        kb.text('‹ К устройствам', `dv:admin:${first}`)
        await ctx.editMessageText(`Выберите команду для нового устройства в потоке №${first}:`, {
          reply_markup: kb,
        })
      } else if (action === 'at') {
        ctx.session.deviceDraft = {
          mode: 'admin_name',
          teamId: second,
          flowNumber: Number(first),
          adminMessageId: ctx.callbackQuery?.message?.message_id,
        } satisfies Draft
        await ctx.editMessageText(
          'Напишите название устройства одним сообщением. После добавления ваше сообщение будет удалено.',
          {
            reply_markup: new InlineKeyboard().text('Отмена', `dv:admin:${first}`),
          }
        )
      } else if (action === 'ad') await showAdminDevice(ctx, first)
      else if (action === 'am') {
        const device = await ProPresenterDeviceModel.findById(first)
        if (!device || device.status !== 'active') throw new Error('Устройство не найдено')
        const kb = new InlineKeyboard()
        for (const stream of await availableDeviceFlows(device.flowNumber))
          kb.text(`Поток №${stream.flowNumber}`, `dv:atf:${first}:${stream.flowNumber}`)
            .icon(DEVICE_ICON)
            .row()
        kb.text('‹ К устройству', `dv:ad:${first}`)
        await ctx.editMessageText(`Куда перенести «${device.name}»?`, { reply_markup: kb })
      } else if (action === 'atf') {
        await ctx.editMessageText(`Перенести устройство в поток №${second}?`, {
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', `dv:amc:${first}:${second}`)
            .icon(DEVICE_ICON)
            .row()
            .text('Отмена', `dv:ad:${first}`),
        })
      } else if (action === 'amc') {
        const device = await applyDeviceChange(first, 'move', Number(second), ctx.from.id)
        await syncAffectedRenewals(ctx.api, [Number(second), device.history.at(-1)?.fromFlow])
        await showAdminDevice(ctx, first)
      } else if (action === 'ar') {
        await ctx.editMessageText('Подтвердить отказ от устройства? Оно останется в истории.', {
          reply_markup: new InlineKeyboard()
            .text('✅ Подтвердить', `dv:arc:${first}`)
            .icon(DEVICE_ICON)
            .row()
            .text('Отмена', `dv:ad:${first}`),
        })
      } else if (action === 'arc') {
        const device = await applyDeviceChange(first, 'release', undefined, ctx.from.id)
        await syncAffectedRenewals(ctx.api, [device.flowNumber])
        await showAdminFlow(ctx, device.flowNumber)
      }
      await ctx.answerCallbackQuery()
      return true
    }

    const team = await TeamModel.findById(first)
    if (!team || ctx.chat?.type !== 'private')
      throw new Error('Устройства доступны только участникам команды в личном чате')
    if (action === 'h') {
      const isMember = team.members?.some(
        (member: { telegramId: number; status: string }) =>
          member.telegramId === ctx.from.id && member.status === 'active'
      )
      if (team.ownerId !== ctx.from.id && !isMember)
        throw new Error('Устройства доступны только участникам команды')
    } else if (team.ownerId !== ctx.from.id)
      throw new Error('Действия с устройствами доступны только владельцу команды')
    if (action === 'h') await showUser(ctx, first)
    else if (action === 'af') {
      const subscription = team.subscriptions?.get('propresenter')
      const primaryFlow = Number(subscription?.meta?.flowNumber)
      const teamDevices = await ProPresenterDeviceModel.find({ teamId: first, status: 'active' })
      const distinctFlows = [...new Set(teamDevices.map((device) => device.flowNumber))]
      const flowNumber =
        distinctFlows.length === 1
          ? distinctFlows[0]
          : Number.isSafeInteger(primaryFlow) && primaryFlow > 0
            ? primaryFlow
            : null
      if (!flowNumber)
        throw new Error(
          'Не определён поток команды. Попросите администратора указать основной поток ProPresenter'
        )
      const stream = await ProPresenterStreamModel.findOne({ flowNumber, status: 'active' })
      if (!stream) throw new Error('Поток закрыт или не найден. Обратитесь к администратору')
      ctx.session.deviceDraft = { mode: 'user_name', teamId: first, flowNumber } satisfies Draft
      await showUser(ctx, first, 'add_name', { flowNumber })
    } else if (action === 'ac') {
      const draft: Draft | undefined = ctx.session.deviceDraft
      if (!draft || draft.mode !== 'user_name' || draft.teamId !== first || !draft.name)
        throw new Error('Данные заявки устарели. Начните добавление заново')
      await submitRequest(ctx, {
        action: 'add',
        teamId: first,
        requesterId: ctx.from.id,
        deviceName: draft.name,
        toFlow: draft.flowNumber,
      })
      ctx.session.deviceDraft = undefined
    } else if (action === 'axs') {
      const draft: Draft | undefined = ctx.session.deviceDraft
      if (!draft || draft.mode !== 'user_name' || draft.teamId !== first || !draft.name)
        throw new Error('Данные заявки устарели. Начните добавление заново')
      await showUser(ctx, first, 'add_replace_select', {
        flowNumber: draft.flowNumber,
        name: draft.name,
      })
    } else if (action === 'ax') {
      const draft: Draft | undefined = ctx.session.deviceDraft
      if (!draft || draft.mode !== 'user_name' || draft.teamId !== first || !draft.name)
        throw new Error('Данные заявки устарели. Начните добавление заново')
      await showUser(ctx, first, 'add_replace_confirm', {
        flowNumber: draft.flowNumber,
        name: draft.name,
        deviceId: second,
      })
    } else if (action === 'axc') {
      const draft: Draft | undefined = ctx.session.deviceDraft
      if (!draft || draft.mode !== 'user_name' || draft.teamId !== first || !draft.name)
        throw new Error('Данные заявки устарели. Начните добавление заново')
      await submitRequest(ctx, {
        action: 'add',
        teamId: first,
        requesterId: ctx.from.id,
        deviceName: draft.name,
        toFlow: draft.flowNumber,
        replacesDeviceId: second,
      })
      ctx.session.deviceDraft = undefined
    } else if (action === 'rs') await showUser(ctx, first, 'release_select')
    else if (action === 'rc') await showUser(ctx, first, 'release_confirm', { deviceId: second })
    else if (action === 'rr')
      await submitRequest(ctx, {
        action: 'release',
        teamId: first,
        requesterId: ctx.from.id,
        deviceId: second,
      })
    else if (action === 'ms') await showUser(ctx, first, 'move_select')
    else if (action === 'mf') await showUser(ctx, first, 'move_flow', { deviceId: second })
    else if (action === 'mc')
      await showUser(ctx, first, 'move_confirm', { deviceId: second, flowNumber: Number(third) })
    else if (action === 'mr')
      await submitRequest(ctx, {
        action: 'move',
        teamId: first,
        requesterId: ctx.from.id,
        deviceId: second,
        toFlow: Number(third),
      })
    await ctx.answerCallbackQuery().catch(() => {})
  } catch (error) {
    await ctx
      .answerCallbackQuery({
        text: error instanceof Error ? error.message : 'Ошибка устройства',
        show_alert: true,
      })
      .catch(() => {})
  }
  return true
}

export async function handleDeviceNameText(ctx: any): Promise<boolean> {
  const draft: Draft | undefined = ctx.session?.deviceDraft
  if (!draft || ctx.chat?.type !== 'private' || !ctx.message?.text) return false
  if (ctx.message.text.startsWith('/')) {
    ctx.session.deviceDraft = undefined
    return false
  }
  const name = ctx.message.text.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 80) {
    await ctx.reply('Название должно содержать от 2 до 80 символов.')
    return true
  }
  await ctx.deleteMessage().catch(() => {})
  try {
    if (draft.mode === 'admin_name') {
      if (!(await hasAdminPermission(ctx.from.id, 'streams.edit'))) throw new Error('Нет прав')
      await createApprovedDevice({
        name,
        teamId: draft.teamId,
        flowNumber: draft.flowNumber,
        adminId: ctx.from.id,
      })
      await syncAffectedRenewals(ctx.api, [draft.flowNumber])
      ctx.session.deviceDraft = undefined
      if (draft.adminMessageId) {
        await showAdminFlow(
          {
            editMessageText: (text: string, options: any) =>
              ctx.api.editMessageText(ctx.chat.id, draft.adminMessageId!, text, options),
          },
          draft.flowNumber
        )
      }
    } else {
      draft.name = name
      await showUser(ctx, draft.teamId, 'add_confirm', { flowNumber: draft.flowNumber, name })
    }
  } catch (error) {
    await ctx.reply(error instanceof Error ? error.message : 'Не удалось сохранить устройство')
  }
  return true
}
