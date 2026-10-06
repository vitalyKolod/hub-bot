import { Types } from 'mongoose'
import { TeamModel } from '../models/Team.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../models/ProPresenterDevice.js'
import { ProPresenterRenewalSeatModel } from '../models/ProPresenterRenewal.js'

export const DEVICE_ICON = '5431376038628171216'
export const DEVICE_REQUEST_THREAD_ID = Number(process.env.PROP_DEVICE_REQUEST_THREAD_ID || 221)

function normalizeName(value: string) {
  const name = value.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 80) throw new Error('Название устройства должно быть длиной от 2 до 80 символов')
  return name
}

async function requireTeamOwner(teamId: string, userId: number) {
  const team = await TeamModel.findById(teamId)
  if (!team || team.ownerId !== userId) throw new Error('Управлять устройствами может только владелец команды')
  return team
}

async function requireStream(flowNumber: number) {
  const stream = await ProPresenterStreamModel.findOne({ flowNumber })
  if (!stream || stream.status !== 'active') throw new Error('Поток не найден или закрыт')
  return stream
}

async function requireDeviceCapacity(flowNumber: number) {
  const stream = await requireStream(flowNumber)
  const count = await ProPresenterDeviceModel.countDocuments({ flowNumber, status: 'active' })
  if (stream.capacity && count >= stream.capacity) throw new Error(`Поток №${flowNumber} заполнен: ${count}/${stream.capacity} устройств`)
  return stream
}

async function requireNoPendingPayment(deviceId: string) {
  const waiting = await ProPresenterRenewalSeatModel.exists({ devices: { $elemMatch: { deviceId, paymentStatus: 'pending' } } })
  if (waiting) throw new Error('По устройству есть чек на проверке. Дождитесь решения по оплате')
}

export async function listTeamDevices(teamId: string) {
  return ProPresenterDeviceModel.find({ teamId, status: 'active' }).sort({ flowNumber: 1, name: 1 })
}

export async function listTeamDeviceRequests(teamId: string) {
  return ProPresenterDeviceRequestModel.find({ teamId, status: 'pending' }).sort({ createdAt: -1 })
}

export async function listFlowDevices(flowNumber: number) {
  return ProPresenterDeviceModel.find({ flowNumber, status: 'active' }).sort({ name: 1 })
}

export async function availableDeviceFlows(exclude?: number) {
  const streams = await ProPresenterStreamModel.find({ status: 'active', ...(exclude ? { flowNumber: { $ne: exclude } } : {}) }).sort({ flowNumber: 1 })
  const counts = await Promise.all(streams.map((stream) => ProPresenterDeviceModel.countDocuments({ flowNumber: stream.flowNumber, status: 'active' })))
  return streams.filter((stream, index) => !stream.capacity || counts[index] < stream.capacity)
}

export async function createDeviceRequest(input: {
  action: 'add' | 'release' | 'move'
  teamId: string
  requesterId: number
  deviceId?: string
  deviceName?: string
  replacesDeviceId?: string
  toFlow?: number
}) {
  const team = await requireTeamOwner(input.teamId, input.requesterId)
  if (input.action === 'add') {
    const flowNumber = Number(input.toFlow)
    const replaced = input.replacesDeviceId
      ? await ProPresenterDeviceModel.findOne({ _id: input.replacesDeviceId, teamId: input.teamId, flowNumber, status: 'active' }) : null
    if (input.replacesDeviceId && !replaced) throw new Error('Заменяемое устройство не найдено в этом потоке')
    if (replaced) {
      await requireNoPendingPayment(replaced.id)
      if (replaced.paidThrough && new Date(replaced.paidThrough).getTime() > Date.now()) throw new Error('Устройство уже оплачено. Замену согласуйте с администратором отдельно')
      if (await ProPresenterDeviceRequestModel.exists({ status: 'pending', $or: [{ deviceId: replaced.id }, { replacesDeviceId: replaced.id }] })) throw new Error('По заменяемому устройству уже есть заявка')
      await requireStream(flowNumber)
    } else await requireDeviceCapacity(flowNumber)
    const subscription = team.subscriptions.get('propresenter')
    if (!subscription || !['active', 'expired'].includes(subscription.status)) {
      throw new Error('У команды нет подписки ProPresenter')
    }
    const name = normalizeName(input.deviceName || '')
    if (await ProPresenterDeviceRequestModel.exists({ action: 'add', status: 'pending', teamId: input.teamId, toFlow: flowNumber, deviceName: name })) {
      throw new Error('Заявка на это устройство уже ожидает проверки')
    }
    return ProPresenterDeviceRequestModel.create({
      action: 'add', teamId: input.teamId, requestedBy: input.requesterId,
      deviceName: name, toFlow: flowNumber, replacesDeviceId: replaced?.id || null,
    })
  }
  if (!input.deviceId || !Types.ObjectId.isValid(input.deviceId)) throw new Error('Устройство не найдено')
  const device = await ProPresenterDeviceModel.findOne({ _id: input.deviceId, teamId: input.teamId, status: 'active' })
  if (!device) throw new Error('Устройство не найдено в этой команде')
  await requireNoPendingPayment(input.deviceId)
  if (await ProPresenterDeviceRequestModel.exists({ deviceId: input.deviceId, status: 'pending' })) {
    throw new Error('По этому устройству уже есть заявка на проверке')
  }
  if (input.action === 'move') {
    if (Number(input.toFlow) === device.flowNumber) throw new Error('Устройство уже находится в этом потоке')
    await requireDeviceCapacity(Number(input.toFlow))
  }
  return ProPresenterDeviceRequestModel.create({
    action: input.action, deviceId: input.deviceId, deviceName: device.name,
    teamId: input.teamId, fromFlow: device.flowNumber,
    toFlow: input.action === 'move' ? input.toFlow : null, requestedBy: input.requesterId,
  })
}

export async function decideDeviceRequest(requestId: string, adminId: number, approve: boolean) {
  if (!Types.ObjectId.isValid(requestId)) throw new Error('Заявка не найдена')
  const request = await ProPresenterDeviceRequestModel.findOneAndUpdate(
    { _id: requestId, status: 'pending' },
    { $set: { status: approve ? 'approved' : 'rejected', decidedBy: adminId, decidedAt: new Date() } },
    { new: true }
  )
  if (!request) throw new Error('Эта заявка уже обработана')
  if (!approve) return request
  try {
    if (request.action === 'add') {
      const replaced = request.replacesDeviceId ? await ProPresenterDeviceModel.findOne({ _id: request.replacesDeviceId, teamId: request.teamId, flowNumber: request.toFlow, status: 'active' }) : null
      if (request.replacesDeviceId && !replaced) throw new Error('Заменяемое устройство больше не находится в этом потоке')
      if (replaced) {
        await requireNoPendingPayment(replaced.id)
        if (replaced.paidThrough && new Date(replaced.paidThrough).getTime() > Date.now()) throw new Error('Устройство уже оплачено. Нужна ручная проверка переноса оплаты')
      }
      const created = await createApprovedDevice({ name: request.deviceName, teamId: request.teamId,
        flowNumber: request.toFlow!, adminId, requestId, replacingDeviceId: replaced?.id })
      if (replaced) {
        try { await applyDeviceChange(replaced.id, 'release', undefined, adminId, requestId) }
        catch (error) {
          await ProPresenterDeviceModel.deleteOne({ _id: created._id, 'history.requestId': requestId }).catch(() => {})
          throw error
        }
      }
    } else {
      const device = await ProPresenterDeviceModel.findById(request.deviceId)
      if (!device || device.status !== 'active' || device.flowNumber !== request.fromFlow || device.teamId !== request.teamId) {
        throw new Error('Устройство изменилось после подачи заявки. Проверьте актуальные данные')
      }
      await applyDeviceChange(request.deviceId!, request.action, request.toFlow || undefined, adminId, requestId)
    }
    return request
  } catch (error) {
    await ProPresenterDeviceRequestModel.updateOne({ _id: request._id, status: 'approved' },
      { $set: { status: 'pending', decidedBy: null, decidedAt: null } })
    throw error
  }
}

export async function createApprovedDevice(input: { name: string; teamId: string; flowNumber: number; adminId: number; requestId?: string; replacingDeviceId?: string }) {
  const team = await TeamModel.findById(input.teamId)
  if (!team) throw new Error('Команда не найдена')
  if (input.requestId) {
    const existing = await ProPresenterDeviceModel.findOne({ 'history.requestId': input.requestId })
    if (existing) return existing
  }
  if (input.replacingDeviceId) await requireStream(input.flowNumber)
  else await requireDeviceCapacity(input.flowNumber)
  return ProPresenterDeviceModel.create({
    name: normalizeName(input.name), teamId: input.teamId, flowNumber: input.flowNumber,
    createdBy: input.adminId,
    history: [{ action: 'added', toFlow: input.flowNumber, at: new Date(), actorId: input.adminId, requestId: input.requestId }],
  })
}

export async function applyDeviceChange(deviceId: string, action: 'release' | 'move', toFlow: number | undefined, adminId: number, requestId?: string) {
  const device = await ProPresenterDeviceModel.findById(deviceId)
  if (!device) throw new Error('Устройство не найдено')
  if (requestId && device.history.some((entry) => entry.requestId === requestId)) return device
  if (device.status !== 'active') throw new Error('Устройство уже неактивно')
  await requireNoPendingPayment(deviceId)
  const pending = await ProPresenterDeviceRequestModel.findOne({ deviceId, status: 'pending' })
  if (pending && String(pending._id) !== requestId) throw new Error('Сначала обработайте открытую заявку по этому устройству')
  if (action === 'move') {
    if (!toFlow || toFlow === device.flowNumber) throw new Error('Выберите другой поток')
    await requireDeviceCapacity(toFlow)
  }
  const fromFlow = device.flowNumber
  if (action === 'move') device.flowNumber = toFlow!
  else {
    device.status = 'released'
    device.releasedAt = new Date()
  }
  device.history.push({ action: action === 'move' ? 'moved' : 'released',
    fromFlow, toFlow: action === 'move' ? toFlow : undefined, at: new Date(), actorId: adminId, requestId })
  await device.save()
  return device
}
