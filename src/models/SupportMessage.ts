import mongoose from 'mongoose'

const attachmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'document', 'video'], required: true },
    telegramFileId: { type: String, required: true },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
  },
  { _id: false }
)

const supportMessageSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
    senderType: { type: String, enum: ['user', 'admin', 'system'], required: true },
    senderId: { type: Number, default: null },
    text: { type: String, default: null },
    attachments: { type: [attachmentSchema], default: [] },
    source: { type: String, enum: ['telegram', 'web'], required: true },
    telegramSourceMessageId: { type: Number, default: null },
    telegramDestinationMessageId: { type: Number, default: null },
  },
  { timestamps: true }
)

supportMessageSchema.index({ ticketId: 1, createdAt: 1 })
supportMessageSchema.index(
  { ticketId: 1, source: 1, telegramSourceMessageId: 1, senderType: 1 },
  { unique: true, partialFilterExpression: { telegramSourceMessageId: { $type: 'number' } } }
)

export const SupportMessageModel = mongoose.model('SupportMessage', supportMessageSchema)
