import { ProPresenterWaitlistModel } from '../models/ProPresenterWaitlist.js'

/**
 * Добавить команду в лист ожидания
 */
export async function addToWaitlist(teamId: string, requestedBy: number) {
  // защита от дублей — если уже есть pending-заявка от этой команды, не плодим новые
  const existing = await ProPresenterWaitlistModel.findOne({ teamId, status: 'pending' })
  if (existing) return existing

  return ProPresenterWaitlistModel.create({
    teamId,
    requestedBy,
    status: 'pending',
  })
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
