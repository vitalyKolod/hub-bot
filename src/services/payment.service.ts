import { Types } from 'mongoose'
import { getProduct, type Currency } from '../config/products.js'
import { PaymentModel } from '../models/Payment.js'
import { ProPresenterDeviceRequestModel } from '../models/ProPresenterDevice.js'
import { activateTeamSubscription, getTeamById } from './team.service.js'
import { createTeamInvite } from './teamInvite.service.js'
import { setCartItemStatus } from './cart.service.js'
import { auditLogService, buildSubscriptionTargetId, recordOperationalEvent } from './auditLog.service.js'
import { eligibleSeats, getRenewalCampaign, renewalAcceptsNewPayments, setRenewalPaymentStatus } from './proPresenterRenewal.service.js'

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
  renewalCampaignId?: string
  renewalDeviceIds?: string[]
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
  const campaign = input.renewalCampaignId ? await getRenewalCampaign(input.renewalCampaignId) : null
  if (input.renewalCampaignId && (!campaign || !renewalAcceptsNewPayments(campaign) || input.productId !== 'propresenter')) {
    throw new Error('Сбор продления уже закрыт или недоступен')
  }
  if (campaign && campaign.billingMode !== 'device') throw new Error('Сбор продления ещё не пересчитан по устройствам')
  if (campaign?.billingMode === 'device') {
    const seat = (await eligibleSeats(campaign.id, input.userId)).find((item) => item.teamId === input.teamId)
    const selected = new Set(input.renewalDeviceIds || [])
    if (!seat || !selected.size || selected.size !== input.renewalDeviceIds?.length || seat.devices.filter((device) => device.active !== false && selected.has(device.deviceId || '') && device.vote === 'yes' && device.paymentStatus === 'none').length !== selected.size || seat.paymentStatus === 'pending') {
      throw new Error('Состав устройств изменился или оплата уже на проверке')
    }
    if (await ProPresenterDeviceRequestModel.exists({ deviceId: { $in: [...selected] }, status: 'pending' })) {
      throw new Error('Сначала дождитесь решения по заявке на устройство')
    }
  }
  const quantity = campaign?.billingMode === 'device' ? input.renewalDeviceIds?.length || 0 : 1
  if (campaign?.billingMode === 'device' && !quantity) throw new Error('Не выбраны устройства для оплаты')
  const amount = campaign
    ? (input.currency === 'rub' ? campaign.priceRub : campaign.priceUsd) * quantity
    : input.currency === 'rub' ? product.priceRub : product.priceUsd
  if (amount === null) throw new Error('Product has no configured price')
  if (campaign) {
    const pending = await PaymentModel.findOne({
      userId: input.userId, teamId: input.teamId, productId: input.productId,
      operation: 'renewal', status: 'pending', cartItemId: null,
    })
    if (pending && pending.renewalCampaignId !== input.renewalCampaignId) {
      throw new Error('У команды уже есть другая оплата ProPresenter на проверке')
    }
  }
  const filter = input.cartItemId
    ? { cartItemId: input.cartItemId }
    : {
        userId: input.userId,
        teamId: input.teamId,
        productId: input.productId,
        operation: input.operation,
        status: 'pending',
      }
  return PaymentModel.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        _id: input.id ? new Types.ObjectId(input.id) : new Types.ObjectId(),
        userId: input.userId,
        teamId: input.teamId,
        productId: input.productId,
        renewalCampaignId: input.renewalCampaignId || null,
        renewalDeviceIds: input.renewalDeviceIds || [],
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
    if (payment.renewalCampaignId) {
      const campaign = await getRenewalCampaign(payment.renewalCampaignId)
      const sub = team.subscriptions.get('propresenter')
      if (!campaign || !['active', 'completed'].includes(campaign.status) || team.ownerId !== payment.userId ||
          (campaign.billingMode !== 'device' && (!['active', 'expired'].includes(sub?.status || '') || Number((sub?.meta as any)?.flowNumber) !== campaign.flowNumber))) {
        throw new Error('Владелец, поток или период продления изменились. Проверьте платёж вручную.')
      }
      await setRenewalPaymentStatus(payment.renewalCampaignId, payment.teamId, payment.id, 'paid', payment.renewalDeviceIds)
    } else if (payment.productId === 'add_member') {
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
      targetSubscriptionId: payment.productId === 'add_member' || payment.renewalCampaignId ? undefined : buildSubscriptionTargetId(payment.teamId, payment.productId),
      metadata: { teamName: team.name, productId: payment.productId, productName: getProduct(payment.productId)?.name, method: payment.paymentMethod, operation: payment.operation },
    })
    return { payment, applied: true, isExtension, teamInviteCode }
  } catch (error) {
    await PaymentModel.updateOne(
      { _id: payment._id, status: 'processing' },
      { $set: { status: 'pending', adminId: null, decisionError: error instanceof Error ? error.message : 'Unknown error' } }
    )
    await recordOperationalEvent({
      type: 'payment.processing_failed', actorType: 'admin', actorTelegramId: adminId,
      targetUserId: payment.userId, targetTeamId: payment.teamId, targetPaymentId: payment.id,
      metadata: { productId: payment.productId, result: 'платёж возвращён в ожидание',
        reason: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
}

export async function rejectPayment(paymentId: string, adminId: number, reason: string): Promise<PaymentDecisionResult> {
  const rejectionReason = reason.trim()
  if (!rejectionReason) throw new Error('Payment rejection reason is required')
  const payment = await PaymentModel.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { $set: { status: 'rejected', adminId, rejectedBy: adminId, rejectedAt: new Date(), rejectionReason, decisionError: null } },
    { new: true }
  )
  if (!payment) {
    const current = await PaymentModel.findById(paymentId)
    if (!current) throw new PaymentNotFoundError('Payment not found')
    return { payment: current, applied: false }
  }
  const team = await getTeamById(payment.teamId)
  if (payment.renewalCampaignId) {
    await setRenewalPaymentStatus(payment.renewalCampaignId, payment.teamId, payment.id, 'none', payment.renewalDeviceIds)
  }
  if (payment.cartItemId) {
    await setCartItemStatus(payment.teamId, payment.cartItemId, 'rejected')
  }
  await auditLogService.createLog({
    type: 'payment.rejected', actorType: 'admin', actorTelegramId: adminId,
    targetUserId: team?.ownerId || payment.userId, targetTeamId: payment.teamId,
    targetPaymentId: payment.id,
    metadata: { teamName: team?.name, productId: payment.productId, productName: getProduct(payment.productId)?.name, method: payment.paymentMethod, operation: payment.operation, rejectionReason },
  })
  return { payment, applied: true }
}

export async function returnPaymentToPending(paymentId: string, adminId: number): Promise<PaymentDecisionResult> {
  const payment = await PaymentModel.findOneAndUpdate(
    { _id: paymentId, status: 'rejected' },
    { $set: { status: 'pending', adminId, decisionError: null } },
    { new: true }
  )
  if (!payment) {
    const current = await PaymentModel.findById(paymentId)
    if (!current) throw new PaymentNotFoundError('Payment not found')
    return { payment: current, applied: false }
  }
  if (payment.cartItemId) await setCartItemStatus(payment.teamId, payment.cartItemId, 'in_review')
  if (payment.renewalCampaignId) {
    await setRenewalPaymentStatus(payment.renewalCampaignId, payment.teamId, payment.id, 'pending', payment.renewalDeviceIds)
  }
  return { payment, applied: true }
}

export function getLatestPaymentStatesForTeam(teamId: string) {
  const rejectedSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return PaymentModel.find({
    teamId,
    $or: [{ status: 'pending' }, { status: 'rejected', rejectedAt: { $gte: rejectedSince } }],
  }).sort({ createdAt: -1 })
}

export function listPayments() {
  return PaymentModel.find().sort({ createdAt: -1 })
}

export function getPayment(paymentId: string) {
  return PaymentModel.findById(paymentId)
}

export function getPaymentsForAdminMessage(messageId: number) {
  return PaymentModel.find({ telegramAdminMessageId: messageId }).sort({ createdAt: 1 })
}
