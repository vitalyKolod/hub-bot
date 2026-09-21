import mongoose from 'mongoose'

export const ADMIN_ACCESS_ROLES = ['superadmin', 'admin', 'consultant'] as const

const adminAccessSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    role: { type: String, enum: ADMIN_ACCESS_ROLES, required: true },
    permissions: { type: [String], default: [] },
    addedBy: { type: Number, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
)

export const AdminAccessModel = mongoose.model('AdminAccess', adminAccessSchema)
