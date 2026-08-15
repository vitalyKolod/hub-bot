import mongoose from 'mongoose'

const memberSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'pending'], default: 'active' },
  },
  { _id: false }
)

const subscriptionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['none', 'pending', 'active', 'expired', 'rejected'],
      default: 'none',
    },
    expiresAt: Date,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // например, номер потока propresenter
  },
  { _id: false }
)

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: Number, required: true },
    members: { type: [memberSchema], default: [] },

    // Map<productId, subscription> — вместо жёстких полей.
    // Ключи = id из config/products.ts. Новый продукт = просто новый ключ,
    // без миграций и без правок схемы.
    subscriptions: {
      type: Map,
      of: subscriptionSchema,
      default: () => new Map(),
    },
  },
  { timestamps: true }
)

export const TeamModel = mongoose.model('Team', teamSchema)
