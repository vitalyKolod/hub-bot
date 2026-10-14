import { Types } from 'mongoose'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../models/ProPresenterDevice.js'
import { ProPresenterRenewalSeatModel } from '../models/ProPresenterRenewal.js'
import { requireAdminPermission } from './adminAccess.service.js'

export async function adminReplaceDevice(input: { deviceId: string; teamId: string; name: string; adminId: number }) {
  await requireAdminPermission(input.adminId, 'streams.edit')
  if (!Types.ObjectId.isValid(input.deviceId)) throw new Error('Устройство не найдено')
  const name = input.name.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 80) throw new Error('Название должно содержать от 2 до 80 символов')
  if (await ProPresenterRenewalSeatModel.exists({ devices: { $elemMatch: { deviceId: input.deviceId, paymentStatus: 'pending' } } }))
    throw new Error('По устройству есть чек на проверке. Дождитесь решения по оплате')
  if (await ProPresenterDeviceRequestModel.exists({ status: 'pending', $or: [{ deviceId: input.deviceId }, { replacesDeviceId: input.deviceId }] }))
    throw new Error('По устройству уже есть заявка на проверке')
  const device = await ProPresenterDeviceModel.findOne({ _id: input.deviceId, teamId: input.teamId, status: 'active' })
  if (!device) throw new Error('Устройство не найдено')
  if (name === device.name) throw new Error('Укажите другое название нового устройства')
  const updated = await ProPresenterDeviceModel.findOneAndUpdate(
    { _id: device._id, teamId: input.teamId, status: 'active', name: device.name, updatedAt: device.updatedAt },
    { $set: { name }, $push: { history: { action: 'replaced', previousName: device.name, newName: name, fromFlow: device.flowNumber, toFlow: device.flowNumber, at: new Date(), actorId: input.adminId } } },
    { new: true }
  )
  if (!updated) throw new Error('Устройство изменилось. Начните замену заново')
  return updated
}
