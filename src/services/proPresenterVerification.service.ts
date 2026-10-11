import { getTeamById, getActiveProPresenterFlowNumber } from './team.service.js'
import { getStreamByNumber } from './proPresenterStream.service.js'
import { auditLogService, buildSubscriptionTargetId } from './auditLog.service.js'
import { ProPresenterVerificationModel } from '../models/ProPresenterVerification.js'

export async function createStreamVerification(teamId: string, userId: number, flowNumber: number) {
  const team = await getTeamById(teamId)
  if (!team || team.ownerId !== userId) throw new Error('Только владелец команды может подать заявку')
  if (!Number.isSafeInteger(flowNumber) || flowNumber < 1) throw new Error('Некорректный номер потока')
  if (await getActiveProPresenterFlowNumber(teamId)) throw new Error('У команды уже есть поток')
  return ProPresenterVerificationModel.findOneAndUpdate({ teamId, open: true }, { $setOnInsert: { teamId, requestedBy: userId, flowNumber, status: 'pending', open: true } }, { upsert: true, new: true, runValidators: true })
}
export async function approveExistingTeamStream(teamId: string, flowNumber: number, adminId: number) {
  const team = await getTeamById(teamId)

  if (!team) {
    throw new Error('Команда не найдена')
  }

  const stream = await getStreamByNumber(flowNumber)

  if (!stream) {
    throw new Error('Поток не найден в базе')
  }

  const existing = team.subscriptions.get('propresenter')

  const applied = existing?.status !== 'active' || Number(existing?.meta?.flowNumber) !== flowNumber
  team.subscriptions.set('propresenter', {
    status: 'active',
    expiresAt: stream.expiresAt || existing?.expiresAt || null,
    meta: {
      flowNumber: stream.flowNumber,
      email: stream.email,
      password: stream.password,
      chatLink: stream.chatLink,
    },
  } as any)

  await team.save()

  const auditBase = {
    actorType: 'admin' as const,
    actorTelegramId: adminId,
    targetUserId: team.ownerId,
    targetTeamId: teamId,
    targetSubscriptionId: buildSubscriptionTargetId(teamId, 'propresenter'),
    metadata: {
      teamName: team.name,
      productId: 'propresenter',
      productName: 'Pro Presenter',
      flowNumber,
      expiresAt: stream.expiresAt,
    },
  }
  if (applied && (!existing || ['none', 'rejected'].includes(existing.status))) {
    await auditLogService.createLog({ type: 'subscription.created', ...auditBase })
  }
  if (applied) await auditLogService.createLog({ type: 'subscription.activated', ...auditBase })
  if (applied) await auditLogService.createLog({ type: 'propresenter.team_added', ...auditBase })

  return { team, stream, applied }
}

export async function decideStreamVerification(id: string, adminId: number, approve: boolean) {
  const request = await ProPresenterVerificationModel.findOneAndUpdate({ _id: id, $or: [{ status: 'pending' }, { status: 'processing', updatedAt: { $lt: new Date(Date.now() - 60000) } }] }, { $set: { status: 'processing', decidedBy: adminId } }, { new: true })
  if (!request) return { request: await ProPresenterVerificationModel.findById(id), applied: false }
  try {
    const team = await getTeamById(request.teamId)
    if (!team || team.ownerId !== request.requestedBy) throw new Error('Команда или её владелец изменились')
    const approved = approve ? await approveExistingTeamStream(request.teamId, request.flowNumber, adminId) : null
    request.status = approve ? 'approved' : 'rejected'; request.open = false; request.decidedAt = new Date()
    await request.save(); return { request, applied: true, team: approved?.team, stream: approved?.stream }
  } catch (error) {
    await ProPresenterVerificationModel.updateOne({ _id: id, status: 'processing' }, { $set: { status: 'pending', decidedBy: null } })
    throw error
  }
}
