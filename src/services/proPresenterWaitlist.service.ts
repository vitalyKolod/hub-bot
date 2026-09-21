import { ProPresenterWaitlistModel } from '../models/ProPresenterWaitlist.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { ProPresenterRequestBatchModel } from '../models/ProPresenterRequestBatch.js'
import { auditLogService } from './auditLog.service.js'

export const PROPRESENTER_BATCH_SIZE = 20
export const REQUEST_BATCH_TITLE_MAX_LENGTH = 100

export function defaultRequestBatchTitle(flowNumber: number) {
  return `Заявки на поток №${flowNumber}`
}

export async function getRequestBatchTitle(flowNumber: number) {
  const batch = await ProPresenterRequestBatchModel.findOne({ flowNumber }).lean()
  return batch?.title?.trim() || defaultRequestBatchTitle(flowNumber)
}

export async function renameRequestBatch(flowNumber: number, rawTitle: string, actorId: number) {
  const title = rawTitle.replace(/\s+/g, ' ').trim()
  if (!title) throw new Error('Название не должно быть пустым')
  if (title.length > REQUEST_BATCH_TITLE_MAX_LENGTH) throw new Error(`Название не должно быть длиннее ${REQUEST_BATCH_TITLE_MAX_LENGTH} символов`)
  const previousTitle = await getRequestBatchTitle(flowNumber)
  const batch = await ProPresenterRequestBatchModel.findOneAndUpdate(
    { flowNumber }, { $set: { title } }, { upsert: true, new: true, runValidators: true }
  )
  await auditLogService.createLog({
    type: 'propresenter.request_title_changed', actorType: 'admin', actorTelegramId: actorId,
    metadata: { flowNumber, oldTitle: previousTitle, newTitle: title },
  })
  return batch
}

async function assignLegacyPendingEntries() {
  const legacyEntries = await ProPresenterWaitlistModel.find({
    status: 'pending',
    assignedFlowNumber: null,
  }).sort({ createdAt: 1 })
  if (!legacyEntries.length) return

  const [lastStream, lastPendingBatch] = await Promise.all([
    ProPresenterStreamModel.findOne().sort({ flowNumber: -1 }),
    ProPresenterWaitlistModel.findOne({
      status: 'pending',
      assignedFlowNumber: { $ne: null },
    }).sort({ assignedFlowNumber: -1 }),
  ])
  let flowNumber = Math.max(
    (lastStream?.flowNumber || 0) + 1,
    lastPendingBatch?.assignedFlowNumber || 0
  )
  let count = await ProPresenterWaitlistModel.countDocuments({
    status: 'pending',
    assignedFlowNumber: flowNumber,
  })

  for (const entry of legacyEntries) {
    if (count >= PROPRESENTER_BATCH_SIZE) {
      flowNumber += 1
      count = 0
    }
    entry.assignedFlowNumber = flowNumber
    await entry.save()
    count += 1
  }
}

/**
 * Добавить команду в лист ожидания
 */
export async function addToWaitlist(teamId: string, requestedBy: number) {
  await assignLegacyPendingEntries()
  // защита от дублей — если уже есть pending-заявка от этой команды, не плодим новые
  const existing = await ProPresenterWaitlistModel.findOne({ teamId, status: 'pending' })
  if (existing) {
    const position = await ProPresenterWaitlistModel.countDocuments({
      status: 'pending',
      assignedFlowNumber: existing.assignedFlowNumber,
      createdAt: { $lte: existing.createdAt },
    })
    return { entry: existing, position, created: false }
  }

  const lastStream = await ProPresenterStreamModel.findOne().sort({ flowNumber: -1 })
  const lastPendingBatch = await ProPresenterWaitlistModel.findOne({ status: 'pending' }).sort({
    assignedFlowNumber: -1,
  })
  let assignedFlowNumber = Math.max(
    (lastStream?.flowNumber || 0) + 1,
    lastPendingBatch?.assignedFlowNumber || 0
  )
  const batchCount = assignedFlowNumber
    ? await ProPresenterWaitlistModel.countDocuments({ status: 'pending', assignedFlowNumber })
    : 0
  if (batchCount >= PROPRESENTER_BATCH_SIZE) assignedFlowNumber += 1

  const entry = await ProPresenterWaitlistModel.create({
    teamId,
    requestedBy,
    status: 'pending',
    assignedFlowNumber,
  })
  const position = await ProPresenterWaitlistModel.countDocuments({
    status: 'pending',
    assignedFlowNumber,
    createdAt: { $lte: entry.createdAt },
  })
  return { entry, position, created: true }
}

export async function getPendingBatch(flowNumber: number) {
  await assignLegacyPendingEntries()
  return ProPresenterWaitlistModel.find({
    status: 'pending',
    assignedFlowNumber: flowNumber,
  }).sort({ createdAt: 1 })
}

export async function getPendingBatches() {
  await assignLegacyPendingEntries()
  const batches = await ProPresenterWaitlistModel.aggregate<{ _id: number; count: number }>([
    { $match: { status: 'pending', assignedFlowNumber: { $ne: null } } },
    { $group: { _id: '$assignedFlowNumber', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  const metadata = await ProPresenterRequestBatchModel.find({ flowNumber: { $in: batches.map((batch) => batch._id) } }).lean()
  const titles = new Map(metadata.map((batch) => [batch.flowNumber, batch.title]))
  return batches.map((batch) => ({ ...batch, title: titles.get(batch._id)?.trim() || defaultRequestBatchTitle(batch._id) }))
}

/** Атомарно помечает заполненную партию, чтобы уведомление админу ушло только один раз. */
export async function claimBatchReadyNotification(flowNumber: number) {
  const count = await ProPresenterWaitlistModel.countDocuments({
    status: 'pending',
    assignedFlowNumber: flowNumber,
  })
  if (count < PROPRESENTER_BATCH_SIZE) return false

  const first = await ProPresenterWaitlistModel.findOne({
    status: 'pending',
    assignedFlowNumber: flowNumber,
  }).sort({ createdAt: 1 })
  if (!first) return false

  const claimed = await ProPresenterWaitlistModel.findOneAndUpdate(
    { _id: first._id, batchReadyNotified: { $ne: true } },
    { $set: { batchReadyNotified: true } },
    { new: true }
  )
  return Boolean(claimed)
}

/**
 * Все, кто сейчас ждёт (для отображения админу)
 */
export async function getPendingWaitlist() {
  return ProPresenterWaitlistModel.find({ status: 'pending' }).sort({ createdAt: 1 }) // от старых к новым — по очереди
}

/**
 * Сколько всего человек в очереди
 */
export async function getWaitlistCount(): Promise<number> {
  return ProPresenterWaitlistModel.countDocuments({ status: 'pending' })
}

/**
 * Пометить заявку как назначенную в конкретный поток
 */
export async function assignWaitlistEntry(entryId: string, flowNumber: number) {
  return ProPresenterWaitlistModel.findByIdAndUpdate(
    entryId,
    { status: 'assigned', assignedFlowNumber: flowNumber },
    { new: true }
  )
}

/**
 * Отменить заявку (например, команда передумала)
 */
export async function cancelWaitlistEntry(entryId: string) {
  return ProPresenterWaitlistModel.findByIdAndUpdate(
    entryId,
    { status: 'cancelled' },
    { new: true }
  )
}

export async function getWaitlistEntryById(entryId: string) {
  return ProPresenterWaitlistModel.findById(entryId)
}
