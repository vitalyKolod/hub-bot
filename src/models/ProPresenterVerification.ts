import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  teamId: { type: String, required: true },
  requestedBy: { type: Number, required: true },
  flowNumber: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'processing', 'approved', 'rejected'], default: 'pending' },
  open: { type: Boolean, default: true },
  decidedBy: { type: Number, default: null },
  decidedAt: { type: Date, default: null },
  adminMessageId: { type: Number, default: null },
}, { timestamps: true })
schema.index({ teamId: 1 }, { unique: true, partialFilterExpression: { open: true } })
export const ProPresenterVerificationModel = mongoose.model('ProPresenterVerification', schema)
