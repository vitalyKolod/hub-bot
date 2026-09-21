import { Types } from 'mongoose'
import { getProduct, type Currency } from '../config/products.js'
import { PaymentModel } from '../models/Payment.js'
import { activateTeamSubscription, getTeamById, rejectTeamSubscription } from './team.service.js'
import { createTeamInvite } from './teamInvite.service.js'
import { setCartItemStatus } from './cart.service.js'
import { auditLogService, buildSubscriptionTargetId } from './auditLog.service.js'

export type ReceiptInput = {
  type: 'photo' | 'document'
  telegramFileId: string
  fileName?: string
  mimeType?: string
}

export type CreatePaymentInput = {
  id?: string
  userId: number
  teamId: string
  productId: string
  cartItemId?: string
  currency: Currency
  paymentMethod: string
  operation: 'purchase' | 'renewal'
  receipt: ReceiptInput
}

export type PaymentDecisionResult = {
  payment: any
  applied: boolean
  isExtension?: boolean
  teamInviteCode?: string
}

export class PaymentNotFoundError extends Error {}

export async function createPayment(input: CreatePaymentInput) {
  const product = getProduct(input.productId)
  if (!product) throw new Error('Unknown product')
  const amount = input.currency === 'rub' ? product.priceRub : product.priceUsd
  if (amount === null) throw new Error('Product has no configured price')
  const filter = input.cartItemId ? { cartItemId: input.cartItemId } : { _id: input.id || new Types.ObjectId() }
  return PaymentModel.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        userId: input.userId,
        teamId: input.teamId,
        productId: input.productId,
        cartItemId: input.cartItemId || null,
        amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        operation: input.operation,
        receipt: input.receipt,
        status: 'pending',
      },
    },
    { new: true, upsert: true, runValidators: true }
  )
}

export async function attachPaymentTelegramLocation(
  paymentId: string,
  location: { threadId?: number; messageId: number }
) {
  return PaymentModel.findByIdAndUpdate(
    paymentId,
    { telegramAdminThreadId: location.threadId || null, telegramAdminMessageId: location.messageId },
    { new: true }
  )
}

export async function acceptPayment(paymentId: string, adminId: number): Promise<PaymentDecisionResult> {
  const payment = await PaymentModel.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { $set: { status: 'processing', adminId, decisionError: null } },
    { new: true }
  )
  if (!payment) {
    const current = await PaymentModel.findById(paymentId)
    if (!current) throw new PaymentNotFoundError('Payment not found')
    return { payment: current, applied: false }
  }

  try {
    const team = await getTeamById(payment.teamId)
    if (!team) throw new Error('Team not found')
    let isExtension = false
    let teamInviteCode: string | undefined
    if (payment.productId === 'add_member') {
      const invite = await createTeamInvite(payment.teamId, team.ownerId, payment.id)
      teamInviteCode = invite.code
    } else {
      const result = await activateTeamSubscription(
        payment.teamId, payment.productId, 1,
        { actorType: 'admin', actorTelegramId: adminId }, payment.id
      )
      isExtension = Boolean(result.isExtension)
    }
    if (payment.cartItemId) await setCartItemStatus(payment.teamId, payment.cartItemId, 'active')
    payment.status = 'accepted'
    payment.acceptedAt = new Date()
    await payment.save()
    await auditLogService.createLog({
      type: 'payment.approved',
      actorType: 'admin', actorTelegramId: adminId,
      targetUserId: team.ownerId, targetTeamId: payment.teamId,
      targetPaymentId: payment.id,
      targetSubscriptionId: payment.productId === 'add_member' ? undefined : buildSubscriptionTargetId(payment.teamId, payment.productId),
      metadata: { teamName: team.name, productId: payment.productId, productName: getProduct(payment.productId)?.name, method: payment.paymentMethod, operation: payment.operation },
    })
    return { payment, applied: true, isExtension, teamInviteCode }
  } catch (error) {
    await PaymentModel.updateOne(
      { _id: payment._id, status: 'processing' },
      { $set: { status: 'pending', adminId: null, decisionError: error instanceof Error ? error.message : 'Unknown error' } }
    )
    throw error
  }
}

export async function rejectPayment(paymentId: string, adminId: number): Promise<PaymentDecisionResult> {
  const payment = await PaymentModel.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { $set: { status: 'rejected', adminId, rejectedAt: new Date(), decisionError: null } },
    { new: true }
  )
  if (!payment) {
    const current = await PaymentModel.findById(paymentId)
    if (!current) throw new PaymentNotFoundError('Payment not found')
    return { payment: current, applied: false }
  }
  const team = await getTeamById(payment.teamId)
  if (payment.cartItemId) {
    await rejectTeamSubscription(payment.teamId, payment.productId, { actorType: 'admin', actorTelegramId: adminId })
    await setCartItemStatus(payment.teamId, payment.cartItemId, 'rejected')
  }
  await auditLogService.createLog({
    type: 'payment.rejected', actorType: 'admin', actorTelegramId: adminId,
    targetUserId: team?.ownerId || payment.userId, targetTeamId: payment.teamId,
    targetPaymentId: payment.id,
    metadata: { teamName: team?.name, productId: payment.productId, productName: getProduct(payment.productId)?.name, method: payment.paymentMethod, operation: payment.operation },
  })
  return { payment, applied: true }
}

export function listPayments() {
  return PaymentModel.find().sort({ createdAt: -1 })
}

export function getPayment(paymentId: string) {
  return PaymentModel.findById(paymentId)
}
