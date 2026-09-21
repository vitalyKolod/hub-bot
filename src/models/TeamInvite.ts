import mongoose from 'mongoose'

const teamInviteSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      required: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['active', 'used', 'expired'],
      default: 'active',
    },

    // кто оплатил и создал приглашение (обычно = владелец команды)
    createdBy: {
      type: Number,
      required: true,
    },

    // кто в итоге воспользовался ссылкой
    usedBy: {
      type: Number,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
    paymentId: { type: String, default: null },
  },
  { timestamps: true }
)

teamInviteSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } }
)

export const TeamInviteModel = mongoose.model('TeamInvite', teamInviteSchema)
