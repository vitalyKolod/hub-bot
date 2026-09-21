import mongoose from 'mongoose'

export const PAYMENT_STATUSES = ['pending', 'processing', 'accepted', 'rejected'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

const receiptSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['photo', 'document'], required: true },
    telegramFileId: { type: String, required: true },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
  },
  { _id: false }
)

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    teamId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    cartItemId: { type: String, default: null, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['rub', 'usd'], required: true },
    paymentMethod: { type: String, required: true },
    operation: { type: String, enum: ['purchase', 'renewal'], required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    receipt: { type: receiptSchema, required: true },
    adminId: { type: Number, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    decisionError: { type: String, default: null },
    telegramAdminThreadId: { type: Number, default: null },
    telegramAdminMessageId: { type: Number, default: null },
  },
  { timestamps: true }
)

paymentSchema.index({ status: 1, createdAt: -1 })
paymentSchema.index({ userId: 1, createdAt: -1 })
paymentSchema.index(
  { cartItemId: 1 },
  { unique: true, partialFilterExpression: { cartItemId: { $type: 'string' } } }
)

export const PaymentModel = mongoose.model('Payment', paymentSchema)
