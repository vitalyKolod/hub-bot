import mongoose from 'mongoose'

const proPresenterWaitlistSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      required: true,
      index: true,
    },

    requestedBy: {
      type: Number, // telegramId владельца, оставившего заявку
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'assigned', 'cancelled'],
      default: 'pending',
    },

    assignedFlowNumber: {
      type: Number,
      default: null,
      index: true,
    },

    batchReadyNotified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

export const ProPresenterWaitlistModel = mongoose.model(
  'ProPresenterWaitlist',
  proPresenterWaitlistSchema
)
