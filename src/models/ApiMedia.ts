import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  actorId: { type: Number, required: true },
  purpose: { type: String, enum: ['tutorial', 'broadcast'], required: true },
  type: { type: String, enum: ['photo', 'video', 'document'], required: true },
  telegramFileId: { type: String, required: true },
  fileName: String, mimeType: String,
}, { timestamps: true })
export const ApiMediaModel = mongoose.model('ApiMedia', schema)
