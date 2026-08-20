import { ProPresenterWaitlistModel } from '../models/ProPresenterWaitlist.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'

export const PROPRESENTER_BATCH_SIZE = 20

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
  return ProPresenterWaitlistModel.aggregate<{ _id: number; count: number }>([
    { $match: { status: 'pending', assignedFlowNumber: { $ne: null } } },
    { $group: { _id: '$assignedFlowNumber', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
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
