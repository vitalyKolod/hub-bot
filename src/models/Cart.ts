import mongoose from 'mongoose'

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: String, required: true }, // id из PRODUCTS
    status: {
      type: String,
      enum: ['pending', 'in_review', 'active', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true } // даёт subdoc свой _id — им адресуем позицию
)

const cartSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
)

export const CartModel = mongoose.model('Cart', cartSchema)
