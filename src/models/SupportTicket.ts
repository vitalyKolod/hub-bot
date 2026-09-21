import mongoose from 'mongoose'

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    threadId: { type: Number, required: true, unique: true, index: true },
    cardMessageId: { type: Number, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    closedBy: { type: String, enum: ['user', 'admin', 'system'], default: null },
    closeReason: { type: String, enum: ['manual', 'inactivity'], default: null },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    closedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: Number, default: null },
  },
  { timestamps: true }
)

supportTicketSchema.index({ userId: 1, status: 1 })
supportTicketSchema.index({ status: 1, lastActivityAt: 1 })
supportTicketSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
)

export const SupportTicketModel = mongoose.model('SupportTicket', supportTicketSchema)
