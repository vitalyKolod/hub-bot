import type { Api } from 'grammy'
import { UserModel } from '../models/User.js'
import { BroadcastModel } from '../models/Broadcast.js'
import { ApiMediaModel } from '../models/ApiMedia.js'
import { adminGetUserIdsInStream } from './adminPanel.service.js'
import { hasAdminPermission } from './adminAccess.service.js'

export async function resolveBroadcastRecipients(audience: 'all' | 'stream', flowNumber?: number) {
  if (audience === 'stream') {
    if (!Number.isSafeInteger(flowNumber) || Number(flowNumber) < 1) throw new Error('Укажите номер потока')
    return adminGetUserIdsInStream(flowNumber!)
  }
  const users = await UserModel.find({ reg: 'done' }).select('telegramId').lean()
  return users.map(user => user.telegramId)
}
export async function createBroadcastDraft(input: { actorId: number; audience: 'all' | 'stream'; flowNumber?: number; text?: string; mediaId?: string }) {
  const recipients = await resolveBroadcastRecipients(input.audience, input.flowNumber)
  if (recipients.length > 50000) throw new Error('Слишком много получателей для одного задания')
  if (!input.text?.trim() && !input.mediaId) throw new Error('Добавьте текст или медиа')
  if (input.mediaId && !(await ApiMediaModel.exists({ _id: input.mediaId, actorId: input.actorId, purpose: 'broadcast' }))) throw new Error('Медиа не найдено')
  if (input.mediaId && (input.text?.length || 0) > 1000) throw new Error('Подпись медиа: максимум 1000 символов')
  return BroadcastModel.create({ ...input, source: 'api', recipients })
}
export function broadcastData(job: any) {
  return { id: job.id, actorId: job.actorId, source: job.source, audience: job.audience, flowNumber: job.flowNumber || null, text: job.text, mediaUrl: job.mediaId ? `/api/admin/broadcasts/${job.id}/media` : null, telegramPreviews: job.telegramPreviews.map((preview: any) => ({ text: preview.text || null, attachments: (preview.attachments || []).map((a: any) => ({ type: a.type, fileName: a.fileName || null })) })), total: job.recipients.length, status: job.status, success: job.success, failed: job.failed, createdAt: job.createdAt, updatedAt: job.updatedAt, completedAt: job.completedAt }
}
export async function processBroadcastBatch(api: Api) {
  const job = await BroadcastModel.findOneAndUpdate({ source: 'api', status: 'running', leaseUntil: { $lte: new Date() } }, { $set: { leaseUntil: new Date(Date.now() + 60000) } }, { new: true })
  if (!job) return
  if (!(await hasAdminPermission(job.actorId, 'broadcasts.send'))) { job.status = 'cancelled'; await job.save(); return }
  const media = job.mediaId ? await ApiMediaModel.findById(job.mediaId) : null
  const end = Math.min(job.cursor + 5, job.recipients.length)
  for (; job.cursor < end;) {
    const current = await BroadcastModel.findById(job.id).select('status')
    if (current?.status !== 'running') return
    const target = job.recipients[job.cursor]
    try {
      if (job.mediaId && !media) throw new Error('Media missing')
      if (!media) await api.sendMessage(target, job.text)
      else if (media.type === 'photo') await api.sendPhoto(target, media.telegramFileId, { caption: job.text || undefined })
      else if (media.type === 'video') await api.sendVideo(target, media.telegramFileId, { caption: job.text || undefined })
      else await api.sendDocument(target, media.telegramFileId, { caption: job.text || undefined })
      job.success++
    } catch (error: any) {
      if (error?.parameters?.retry_after) {
        job.leaseUntil = new Date(Date.now() + Number(error.parameters.retry_after) * 1000)
        await BroadcastModel.updateOne({ _id: job.id, status: 'running' }, { $set: { leaseUntil: job.leaseUntil } }); return
      }
      job.failed++
    }
    job.cursor++
    await BroadcastModel.updateOne({ _id: job.id, status: 'running' }, { $set: { cursor: job.cursor, success: job.success, failed: job.failed, leaseUntil: new Date(Date.now() + 60000) } })
  }
  await BroadcastModel.updateOne({ _id: job.id, status: 'running' }, { $set: { leaseUntil: new Date(), ...(job.cursor >= job.recipients.length ? { status: 'completed', completedAt: new Date() } : {}) } })
}
export function startBroadcastWorker(api: Api) {
  let running = false
  const timer = setInterval(async () => {
    if (running) return; running = true
    try { await processBroadcastBatch(api) } catch { console.error('[API broadcasts] Worker failed; retrying later') } finally { running = false }
  }, 5000)
  timer.unref(); return () => clearInterval(timer)
}
