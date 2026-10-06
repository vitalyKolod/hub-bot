import mongoose from 'mongoose'

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  teamId: { type: String, required: true, index: true },
  flowNumber: { type: Number, required: true, index: true },
  status: { type: String, enum: ['active', 'released'], default: 'active', index: true },
  createdBy: { type: Number, required: true },
  releasedAt: { type: Date, default: null },
  paidThrough: { type: Date, default: null },
  history: [{ action: { type: String, enum: ['added', 'moved', 'released'] }, fromFlow: Number, toFlow: Number, at: Date, actorId: Number, requestId: String }],
}, { timestamps: true })

const requestSchema = new mongoose.Schema({
  action: { type: String, enum: ['add', 'release', 'move'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  deviceId: { type: String, default: null, index: true },
  replacesDeviceId: { type: String, default: null, index: true },
  deviceName: { type: String, required: true },
  teamId: { type: String, required: true, index: true },
  fromFlow: { type: Number, default: null },
  toFlow: { type: Number, default: null },
  requestedBy: { type: Number, required: true },
  decidedBy: { type: Number, default: null },
  decidedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null },
  adminMessageId: { type: Number, default: null },
}, { timestamps: true })

requestSchema.index({ deviceId: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending', deviceId: { $type: 'string' } },
})
requestSchema.index({ replacesDeviceId: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending', replacesDeviceId: { $type: 'string' } },
})
requestSchema.index({ teamId: 1, toFlow: 1, deviceName: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'pending', action: 'add' },
})

export const ProPresenterDeviceModel = mongoose.model('ProPresenterDevice', deviceSchema)
export const ProPresenterDeviceRequestModel = mongoose.model('ProPresenterDeviceRequest', requestSchema)
