import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  paymentId: { type: String, required: true },
  decision: { type: String, enum: ['accepted', 'rejected'], required: true },
  isExtension: Boolean,
  teamInviteCode: String,
  status: { type: String, enum: ['pending', 'processing', 'sent', 'cancelled'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  leaseUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true })
export const ApiNotificationModel = mongoose.model('ApiNotification', schema)
