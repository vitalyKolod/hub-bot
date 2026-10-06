import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  telegramId: { type: Number, required: true },
  productId: { type: String, required: true },
  teamId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'protected', 'blocked', 'restored'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  nextAttemptAt: { type: Date, default: Date.now },
  completedAt: Date,
}, { timestamps: true })

schema.index({ chatId: 1, telegramId: 1 }, { unique: true })
schema.index({ status: 1, nextAttemptAt: 1 })

export const GroupAccessRevocationModel = mongoose.model('GroupAccessRevocation', schema)
