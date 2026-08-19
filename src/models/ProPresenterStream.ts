import mongoose from 'mongoose'

const proPresenterStreamSchema = new mongoose.Schema(
  {
    flowNumber: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    chatLink: {
      type: String,
      default: '',
    },

    capacity: {
      type: Number,
      default: 30,
    },

    status: {
      type: String,
      enum: ['active', 'closed'], // closed — админ больше не принимает сюда новых
      default: 'active',
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    adminReminders: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
)

export const ProPresenterStreamModel = mongoose.model(
  'ProPresenterStream',
  proPresenterStreamSchema
)
