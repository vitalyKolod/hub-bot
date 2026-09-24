import mongoose from 'mongoose'

export const CONVERSATION_TYPES = [
  'support',
  'payment',
  'propresenter_request',
  'stream_confirmation',
  'registration',
] as const

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    type: { type: String, enum: CONVERSATION_TYPES, required: true, index: true },
    contextId: { type: String, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    openedBy: { type: String, enum: ['user', 'admin', 'system'], default: 'admin' },
    openedByAdminId: { type: Number, default: null },
    adminChatId: { type: Number, required: true },
    adminThreadId: { type: Number, default: null },
    adminMessageId: { type: Number, default: null },
    controlMessageId: { type: Number, default: null },
    userActive: { type: Boolean, default: false, index: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: Number, default: null },
    closeReason: { type: String, default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: Number, default: null },
  },
  { timestamps: true }
)

conversationSchema.index({ type: 1, contextId: 1 }, { unique: true })
conversationSchema.index({ userId: 1, userActive: 1, status: 1 })

export const ConversationModel = mongoose.model('Conversation', conversationSchema)
