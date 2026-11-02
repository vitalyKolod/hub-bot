import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  actorId: { type: Number, required: true },
  source: { type: String, enum: ['api', 'telegram'], required: true },
  audience: { type: String, enum: ['all', 'stream'], required: true },
  flowNumber: Number,
  text: { type: String, default: '' },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiMedia', default: null },
  sourceChatId: Number,
  sourceMessageIds: { type: [Number], default: [] },
  telegramPreviews: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recipients: { type: [Number], default: [] },
  status: { type: String, enum: ['draft', 'running', 'completed', 'cancelled'], default: 'draft', index: true },
  cursor: { type: Number, default: 0 },
  success: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  leaseUntil: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true })
export const BroadcastModel = mongoose.model('Broadcast', schema)
