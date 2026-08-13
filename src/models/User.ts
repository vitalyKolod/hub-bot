import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },

    username: String,

    fio: String,

    city: String,

    church: String,

    reg: {
      type: String,
      enum: ['none', 'in_progress', 'done'],
      default: 'none',
    },

    regStep: {
      type: String,
      enum: ['fio', 'city', 'church', 'confirm_registration'],
      default: 'fio',
    },
    inputMode: {
      type: String,
      default: null,
    },
    inputData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    editingField: {
      type: String,
      default: null,
    },
    pendingInviteCode: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

export const UserModel = mongoose.model('User', userSchema)
