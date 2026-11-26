import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  priceRub: { type: Number, required: true, min: 1 },
}, { timestamps: true })

export const ProductPriceModel = mongoose.model('ProductPrice', schema)
