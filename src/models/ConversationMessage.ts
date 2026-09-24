import mongoose from 'mongoose'

const conversationMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    direction: { type: String, enum: ['admin_to_user', 'user_to_admin'], required: true },
    senderId: { type: Number, required: true },
    telegramSourceMessageId: { type: Number, required: true },
    telegramDestinationMessageId: { type: Number, required: true },
  },
  { timestamps: true }
)

conversationMessageSchema.index(
  { conversationId: 1, direction: 1, telegramSourceMessageId: 1 },
  { unique: true }
)

export const ConversationMessageModel = mongoose.model('ConversationMessage', conversationMessageSchema)

