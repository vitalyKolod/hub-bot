import type { Api } from 'grammy'
import { ApiNotificationModel } from '../models/ApiNotification.js'
import { PaymentModel } from '../models/Payment.js'
import { getPayment, type PaymentDecisionResult } from '../services/payment.service.js'
import { deliverAcceptedPayment, deliverRejectedPayment } from '../adapters/telegram/paymentDelivery.js'

// Persist intent before calling Telegram. A crashed worker can reclaim an expired lease.
function decisionKey(payment: any) { return `${payment.id}:${payment.status}:${new Date(payment.status === 'accepted' ? payment.acceptedAt : payment.rejectedAt).toISOString()}` }

export async function notifyPaymentDecision(api: Api, result: PaymentDecisionResult) {
  if (!result.applied || !['accepted', 'rejected'].includes(result.payment.status)) return { status: 'not_required' }
  const key = decisionKey(result.payment)
  const record = await ApiNotificationModel.findOneAndUpdate({ key }, { $setOnInsert: { paymentId: result.payment.id, decision: result.payment.status, isExtension: result.isExtension, teamInviteCode: result.teamInviteCode } }, { upsert: true, new: true })
  await PaymentModel.updateOne({ _id: result.payment.id, status: result.payment.status, ...(result.payment.status === 'accepted' ? { acceptedAt: result.payment.acceptedAt } : { rejectedAt: result.payment.rejectedAt }) }, { $set: { 'apiNotification.pending': false } })
  return record!.status === 'sent' ? { status: 'sent' } : attemptNotification(api, record!.id)
}
export async function attemptNotification(api: Api, id?: string) {
  const now = new Date()
  const record = await ApiNotificationModel.findOneAndUpdate({ ...(id ? { _id: id } : {}), $or: [{ status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'processing', leaseUntil: { $lte: now } }] }, { $set: { status: 'processing', leaseUntil: new Date(now.getTime() + 60_000) }, $inc: { attempts: 1 } }, { new: true })
  if (!record) return { status: 'queued' }
  try {
    const payment = await getPayment(record.paymentId)
    if (!payment || payment.status !== record.decision || decisionKey(payment) !== record.key) {
      record.status = 'cancelled'; await record.save(); return { status: 'cancelled' }
    }
    const result: PaymentDecisionResult = { payment, applied: true, isExtension: record.isExtension ?? undefined, teamInviteCode: record.teamInviteCode || undefined }
    if (record.decision === 'accepted') await deliverAcceptedPayment(api, result)
    else await deliverRejectedPayment(api, result)
    record.status = 'sent'; record.sentAt = new Date(); record.lastError = null; record.leaseUntil = null
    await record.save(); return { status: 'sent' }
  } catch {
    record.status = 'pending'; record.lastError = 'TELEGRAM_DELIVERY_FAILED'; record.leaseUntil = null
    record.nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 5000 * 2 ** Math.min(record.attempts, 10)))
    await record.save(); return { status: 'queued', code: 'TELEGRAM_DELIVERY_FAILED' }
  }
}
export function startNotificationWorker(api: Api) {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const waiting = await PaymentModel.find({ 'apiNotification.pending': true, status: { $in: ['accepted', 'rejected'] } }).limit(10)
      for (const payment of waiting) await notifyPaymentDecision(api, { payment, applied: true, isExtension: payment.apiNotification?.isExtension ?? undefined, teamInviteCode: payment.apiNotification?.teamInviteCode ?? undefined })
      for (let i = 0; i < 10; i++) { const result = await attemptNotification(api); if (result.status === 'queued') break } }
    catch { console.error('[API notifications] Worker failed; will retry on next interval') }
    finally { running = false }
  }, 5000)
  timer.unref()
  return () => clearInterval(timer)
}
