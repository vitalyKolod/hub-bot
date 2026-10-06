import mongoose from 'mongoose'

const campaignSchema = new mongoose.Schema({
  flowNumber: { type: Number, required: true, index: true },
  cycleEndsAt: { type: Date, required: true },
  status: { type: String, enum: ['preparing', 'active', 'completed'], default: 'preparing' },
  billingMode: { type: String, enum: ['team', 'device'], default: 'team' },
  chatId: { type: Number, required: true },
  groupMessageId: { type: Number, default: null },
  pollButtonsVersion: { type: Number, default: 1 },
  summaryMessageId: { type: Number, default: null },
  summaryView: { type: String, enum: ['summary', 'lists'], default: 'summary' },
  priceRub: { type: Number, required: true },
  priceUsd: { type: Number, required: true },
  startedBy: { type: Number, required: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  targetEndsAt: { type: Date, default: null },
}, { timestamps: true })

campaignSchema.index({ flowNumber: 1, cycleEndsAt: 1 }, { unique: true })

const seatSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProPresenterRenewalCampaign', required: true, index: true },
  teamId: { type: String, required: true },
  teamName: { type: String, required: true },
  ownerId: { type: Number, required: true, index: true },
  vote: { type: String, enum: ['none', 'yes', 'no'], default: 'none' },
  paymentStatus: { type: String, enum: ['none', 'pending', 'paid'], default: 'none' },
  devices: [{ deviceId: String, name: String, active: { type: Boolean, default: true }, vote: { type: String, enum: ['none', 'yes', 'no'], default: 'none' }, votedAt: Date, paymentStatus: { type: String, enum: ['none', 'pending', 'paid'], default: 'none' }, paymentId: String, paidAt: Date }],
  paymentId: { type: String, default: null },
  votedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  lastReminderAt: { type: Date, default: null },
  reminderCount: { type: Number, default: 0 },
}, { timestamps: true })

seatSchema.index({ campaignId: 1, teamId: 1 }, { unique: true })

export const ProPresenterRenewalCampaignModel = mongoose.model('ProPresenterRenewalCampaign', campaignSchema)
export const ProPresenterRenewalSeatModel = mongoose.model('ProPresenterRenewalSeat', seatSchema)
