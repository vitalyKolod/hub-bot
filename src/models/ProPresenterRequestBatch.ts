import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    flowNumber: { type: Number, required: true, unique: true, index: true },
    title: { type: String, trim: true, maxlength: 100, default: null },
  },
  { timestamps: true }
)

export const ProPresenterRequestBatchModel = mongoose.model('ProPresenterRequestBatch', schema)
