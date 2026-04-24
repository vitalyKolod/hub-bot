import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true },

    fio: String,
    city: String,
    church: String,
    username: String,

    reg: {
      type: String,
      enum: ['none', 'in_progress', 'done'],
      default: 'none',
    },

    regStep: {
      type: String,
      default: 'fio',
    },
    reminders: {
      type: [String],
      default: [],
    },

    // Подписки
    subscriptions: {
      propresenter: {
        status: { type: String, default: 'none' },
        flow: String,
        email: String,
        password: String,
        expiresAt: Date,
      },
      content: {
        status: { type: String, default: 'none' },
        expiresAt: Date,
        extraUsers: { type: Number, default: 0 },
      },
      sunday: {
        status: { type: String, default: 'none' },
        expiresAt: Date,
      },

      // Волонтеры
      volunteers: [
        {
          telegramId: Number,
          fio: String,
        },
      ],
    },

    volunteer: {
      volunteerUserName: String,

      ownerId: Number,
    },
  },
  { timestamps: true }
)

export const UserModel = mongoose.model('User', userSchema)
