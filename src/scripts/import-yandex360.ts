/** Local export format: JSON array of { sourceKey, stream, name, telegramId?, username?, emails?, seats?, amount?, startsAt?, endsAt?, chatLink?, capacity?, adminEmail? }.
 * Export one row per person. sourceKey must be stable and unique across repeated exports.
 * Dry run is the default. --apply writes only new records, never changes existing records.
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Yandex360MemberModel, Yandex360StreamModel } from '../models/Yandex360.js'
import { normalizeEmail, validEmail, validTelegramId } from '../services/yandex360.service.js'

type Row = { sourceKey: string; stream: string; name: string; telegramId?: number; username?: string; emails?: string[]; seats?: number; amount?: number; startsAt?: string; endsAt?: string; chatLink?: string; capacity?: number; adminEmail?: string }
const file = process.argv[2]
if (!file) throw new Error('Usage: npx tsx src/scripts/import-yandex360.ts export.json [--apply]')
const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as Row[]
if (!Array.isArray(rows)) throw new Error('Expected JSON array')
const issues: string[] = []
const keys = new Set<string>(), ids = new Set<number>(), emails = new Set<string>(), streams = new Set<string>()
let emailCount = 0
for (const [i, r] of rows.entries()) {
  const row = i + 1
  if (!r.sourceKey || !r.stream || !r.name) issues.push(`Row ${row}: missing sourceKey, stream, or name`)
  if (keys.has(r.sourceKey)) issues.push(`Row ${row}: duplicate sourceKey`)
  keys.add(r.sourceKey)
  if (r.telegramId != null) { if (!validTelegramId(r.telegramId)) issues.push(`Row ${row}: invalid Telegram ID`); if (ids.has(r.telegramId)) issues.push(`Row ${row}: duplicate Telegram ID`); ids.add(r.telegramId) }
  if (r.seats != null && (!Number.isInteger(r.seats) || r.seats < 1)) issues.push(`Row ${row}: invalid seats`)
  if (r.amount != null && (!Number.isFinite(r.amount) || r.amount < 0)) issues.push(`Row ${row}: invalid amount`)
  if (r.capacity != null && (!Number.isInteger(r.capacity) || r.capacity < 0)) issues.push(`Row ${row}: invalid capacity`)
  for (const d of [r.startsAt, r.endsAt]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) issues.push(`Row ${row}: invalid date`)
  for (const e of r.emails || []) { if (!validEmail(e)) issues.push(`Row ${row}: invalid email`); const normalized = normalizeEmail(e); if (emails.has(normalized)) issues.push(`Row ${row}: duplicate email across rows`); emails.add(normalized); emailCount++ }
  streams.add(r.stream)
}
console.log(JSON.stringify({ streams: streams.size, members: rows.length, emails: emailCount, issues }, null, 2))
if (!process.argv.includes('--apply')) process.exit(0)
if (issues.length) throw new Error('Resolve every preview issue before applying')
const uri = process.env.MONGO_URI || process.env.MONGODB_URI
if (!uri) throw new Error('MONGO_URI is required')
await mongoose.connect(uri)
try {
  for (const r of rows) {
    const importKey = crypto.createHash('sha256').update(r.sourceKey).digest('hex')
    const existing = await Yandex360MemberModel.findOne({ $or: [{ importKey }, ...(r.telegramId ? [{ telegramId: r.telegramId }] : [])] })
    if (existing) { if (existing.importKey !== importKey) throw new Error('Ambiguous match; resolve in export before retrying'); continue }
    const stream = await Yandex360StreamModel.findOneAndUpdate({ name: r.stream }, { $setOnInsert: { name: r.stream, startsAt: r.startsAt || null, endsAt: r.endsAt || null, chatLink: r.chatLink || '', capacity: r.capacity || 0, adminEmail: r.adminEmail || '' } }, { upsert: true, new: true })
    await Yandex360MemberModel.create({ importKey, name: r.name, streamId: stream._id, telegramId: r.telegramId || null, username: r.username || '', seats: r.seats || 1, amount: r.amount ?? null, emails: (r.emails || []).map(e => ({ address: normalizeEmail(e), status: 'pending' })) })
  }
} finally { await mongoose.disconnect() }
