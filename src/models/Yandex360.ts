import mongoose from 'mongoose'

const emailSchema = new mongoose.Schema({
  address: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['pending', 'connected', 'rejected', 'disconnected'], default: 'pending' },
  decidedBy: { type: Number, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true })

const streamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  chatLink: { type: String, default: '' },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  capacity: { type: Number, min: 0, default: 0 },
  adminEmail: { type: String, default: '' },
  amount: { type: Number, min: 0, default: null },
  adminReminders: { type: [String], default: [] },
}, { timestamps: true })

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  telegramId: { type: Number, default: null },
  username: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Yandex360Stream', required: true },
  seats: { type: Number, min: 1, default: 1 },
  amount: { type: Number, min: 0, default: null },
  note: { type: String, default: '' },
  emails: { type: [emailSchema], default: [] },
  importKey: { type: String, default: null },
}, { timestamps: true })
memberSchema.index({ telegramId: 1 }, { unique: true, partialFilterExpression: { telegramId: { $type: 'number' } } })
memberSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } })
memberSchema.index({ importKey: 1 }, { unique: true, partialFilterExpression: { importKey: { $type: 'string' } } })

const requestSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Yandex360Member', required: true },
  streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Yandex360Stream', required: true },
  oldEmailId: { type: mongoose.Schema.Types.ObjectId, default: null },
  proposedEmail: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  decidedBy: { type: Number, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true })
requestSchema.index({ memberId: 1, proposedEmail: 1, status: 1 })

export const Yandex360StreamModel = mongoose.model('Yandex360Stream', streamSchema)
export const Yandex360MemberModel = mongoose.model('Yandex360Member', memberSchema)
export const Yandex360RequestModel = mongoose.model('Yandex360Request', requestSchema)
