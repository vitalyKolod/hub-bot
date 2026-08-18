import mongoose from 'mongoose'

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    threadId: { type: Number, required: true, unique: true, index: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    closedBy: { type: String, enum: ['user', 'admin'], default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

supportTicketSchema.index({ userId: 1, status: 1 })
supportTicketSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
)

export const SupportTicketModel = mongoose.model('SupportTicket', supportTicketSchema)
