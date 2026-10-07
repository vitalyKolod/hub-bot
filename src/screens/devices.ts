import { InlineKeyboard } from 'grammy'
import type { ScreenView } from '../core/render.js'
import { packCb } from '../core/callback.js'
import { TeamModel } from '../models/Team.js'
import { ProPresenterDeviceModel } from '../models/ProPresenterDevice.js'
import {
  availableDeviceFlows,
  DEVICE_ICON,
  listTeamDeviceRequests,
  listTeamDevices,
} from '../services/proPresenterDevice.service.js'

export type DeviceScreenParams = {
  teamId: string
  step?:
    | 'home'
    | 'add_name'
    | 'add_confirm'
    | 'add_replace_select'
    | 'add_replace_confirm'
    | 'release_select'
    | 'release_confirm'
    | 'move_select'
    | 'move_flow'
    | 'move_confirm'
  deviceId?: string
  flowNumber?: number
  name?: string
}

const ADD_DEVICE_ICON = '5260251205682079529'
const RELEASE_DEVICE_ICON = '5300821986451148615'
const MOVE_DEVICE_ICON = '5260450573768990626'

export async function devicesScreen(
  userId: number,
  input: string | DeviceScreenParams
): Promise<ScreenView> {
  const params = typeof input === 'string' ? { teamId: input } : input
  const team = await TeamModel.findById(params?.teamId)
  const isOwner = team?.ownerId === userId
  const isMember = team?.members?.some(
    (member: { telegramId: number; status: string }) =>
      member.telegramId === userId && member.status === 'active'
  )
  if (!team || (!isOwner && !isMember))
    throw new Error('Устройства доступны только участникам команды')
  if (!isOwner && params.step && params.step !== 'home')
    throw new Error('Действия с устройствами доступны только владельцу команды')
  const devices = await listTeamDevices(params.teamId)
  const pending = await listTeamDeviceRequests(params.teamId)
  const busy = new Set(pending.map((request) => request.deviceId).filter(Boolean))
  const step = params.step || 'home'
  const kb = new InlineKeyboard()
  const home = `dv:h:${params.teamId}`
  const back = () => kb.text('‹ К устройствам', home)
  let caption = `Устройства ProPresenter · ${team.name}\n\n`

  if (step === 'home') {
    caption += devices.length
      ? devices
          .map((device) => {
            const request = pending.find((item) => item.deviceId === device.id)
            const mark =
              request?.action === 'release'
                ? ' · ⏳ отказ на проверке'
                : request?.action === 'move'
                  ? ` · ⏳ перенос в поток №${request.toFlow}`
                  : ''
            return `• ${device.name} — поток №${device.flowNumber}${mark}`
          })
          .join('\n')
      : 'Подтверждённых устройств пока нет.'
    const adding = pending.filter((item) => item.action === 'add')
    if (adding.length)
      caption +=
        '\n\nЗаявки на добавление:\n' +
        adding
          .map((item) => `• ${item.deviceName} → поток №${item.toFlow} · ⏳ на проверке`)
          .join('\n')
    if (isOwner) {
      kb.text('Добавить устройство', `dv:af:${params.teamId}`).icon(ADD_DEVICE_ICON).row()
      if (devices.some((device) => !busy.has(device.id))) {
        kb.text('Отказаться от устройства', `dv:rs:${params.teamId}`)
          .icon(RELEASE_DEVICE_ICON)
          .row()
      }
    }
    kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
  } else if (step === 'add_name') {
    caption += `Поток №${params.flowNumber}. Напишите название устройства одним сообщением. Сообщение с названием бот удалит.`
    back()
  } else if (step === 'add_confirm') {
    caption += `«${params.name}» в поток №${params.flowNumber}: это новое устройство или замена существующего? Заявка уйдёт администраторам.`
    if ((await availableDeviceFlows()).some((stream) => stream.flowNumber === params.flowNumber))
      kb.text('✅ Новое устройство · отправить заявку', `dv:ac:${params.teamId}`).row()
    else caption += '\nПоток заполнен: можно только заменить существующее устройство.'
    if (
      devices.some(
        (device) =>
          device.flowNumber === params.flowNumber &&
          !busy.has(device.id) &&
          (!device.paidThrough || new Date(device.paidThrough).getTime() <= Date.now())
      )
    )
      kb.text('🔄 Заменить существующее', `dv:axs:${params.teamId}`).row()
    back()
  } else if (step === 'add_replace_select') {
    caption += `Выберите устройство потока №${params.flowNumber}, которое заменяете на «${params.name}»:`
    for (const device of devices.filter(
      (item) =>
        item.flowNumber === params.flowNumber &&
        !busy.has(item.id) &&
        (!item.paidThrough || new Date(item.paidThrough).getTime() <= Date.now())
    ))
      kb.text(device.name.slice(0, 58), `dv:ax:${params.teamId}:${device.id}`)
        .icon(DEVICE_ICON)
        .row()
    back()
  } else if (step === 'add_replace_confirm') {
    const device = await ProPresenterDeviceModel.findOne({
      _id: params.deviceId,
      teamId: params.teamId,
      status: 'active',
    })
    if (!device || device.flowNumber !== params.flowNumber)
      throw new Error('Заменяемое устройство больше не доступно')
    caption += `Заменить «${device.name}» на «${params.name}» в потоке №${params.flowNumber}? После подтверждения администратором старое устройство будет снято, новое добавлено.`
    kb.text('✅ Отправить заявку', `dv:axc:${params.teamId}:${device.id}`).row()
    back()
  } else if (step === 'release_select' || step === 'move_select') {
    caption +=
      step === 'release_select'
        ? 'Выберите устройство, от которого хотите отказаться:'
        : 'Выберите устройство для переноса:'
    const prefix = step === 'release_select' ? 'rc' : 'mf'
    for (const device of devices.filter((item) => !busy.has(item.id))) {
      kb.text(
        `${device.name} · поток №${device.flowNumber}`.slice(0, 58),
        `dv:${prefix}:${params.teamId}:${device.id}`
      )
        .icon(DEVICE_ICON)
        .row()
    }
    back()
  } else if (step === 'release_confirm') {
    const device = await ProPresenterDeviceModel.findOne({
      _id: params.deviceId,
      teamId: params.teamId,
      status: 'active',
    })
    if (!device) throw new Error('Устройство больше не доступно')
    caption += `Отказаться от «${device.name}» в потоке №${device.flowNumber}? Оно останется активным до решения администратора.`
    kb.text('✅ Отправить заявку', `dv:rr:${params.teamId}:${device.id}`).row()
    back()
  } else if (step === 'move_flow') {
    const device = await ProPresenterDeviceModel.findOne({
      _id: params.deviceId,
      teamId: params.teamId,
      status: 'active',
    })
    if (!device) throw new Error('Устройство больше не доступно')
    caption += `«${device.name}» сейчас в потоке №${device.flowNumber}. Выберите новый поток:`
    const streams = await availableDeviceFlows(device.flowNumber)
    streams.forEach((stream, index) => {
      kb.text(String(stream.flowNumber), `dv:mc:${params.teamId}:${device.id}:${stream.flowNumber}`)
      if ((index + 1) % 3 === 0) kb.row()
    })
    if (streams.length % 3 !== 0) kb.row()
    back()
  } else if (step === 'move_confirm') {
    const device = await ProPresenterDeviceModel.findOne({
      _id: params.deviceId,
      teamId: params.teamId,
      status: 'active',
    })
    if (!device) throw new Error('Устройство больше не доступно')
    caption += `Перенести «${device.name}» из потока №${device.flowNumber} в поток №${params.flowNumber}? Перенос произойдёт после одобрения администратора.`
    kb.text('✅ Отправить заявку', `dv:mr:${params.teamId}:${device.id}:${params.flowNumber}`).row()
    back()
  }
  return { photo: './public/devices.png', caption: caption.slice(0, 1000), keyboard: kb }
}
