import { legalScreen } from '../screens/legal.js'
import { teamAboutScreen } from '../screens/team-about.js'
import { otherScreen } from '../screens/others.js'
import { aboutPaymentScreen } from '../screens/about-payment.js'
import { AuditLogModel } from '../models/AuditLog.js'
import { auditLogService } from '../services/auditLog.service.js'
import { ApiNotificationModel } from '../models/ApiNotification.js'
import { notifyPaymentDecision } from './notifications.js'
import { confirmUserRegistration } from '../services/registration.service.js'
import { notifyRegisteredUser } from '../services/registrationNotification.service.js'
import { ProPresenterVerificationModel } from '../models/ProPresenterVerification.js'
import { createStreamVerification, decideStreamVerification } from '../services/proPresenterVerification.service.js'
import { ApiMediaModel } from '../models/ApiMedia.js'
import { uploadFile, uploadSchema } from './uploads.js'
import { BroadcastModel } from '../models/Broadcast.js'
import { createBroadcastDraft, broadcastData } from '../services/broadcast.service.js'
import { createHash } from 'node:crypto'
import { InputFile, InlineKeyboard } from 'grammy'
import { getPaymentOptions } from '../config/payment.js'
import { PRODUCTS, getProduct } from '../config/products.js'
import { ADMIN_GROUP_ID, SUPPORT_GROUP_ID, PROP_STREAM_VERIFY_THREAD_ID } from '../config/env.js'
import { UserModel } from '../models/User.js'
import { TeamModel } from '../models/Team.js'
import { PaymentModel } from '../models/Payment.js'
import { CartModel } from '../models/Cart.js'
import { SupportTicketModel } from '../models/SupportTicket.js'
import { ProPresenterDeviceModel, ProPresenterDeviceRequestModel } from '../models/ProPresenterDevice.js'
import { ProPresenterWaitlistModel } from '../models/ProPresenterWaitlist.js'
import { ProPresenterRenewalCampaignModel, ProPresenterRenewalSeatModel } from '../models/ProPresenterRenewal.js'
import { Yandex360StreamModel, Yandex360MemberModel, Yandex360RequestModel } from '../models/Yandex360.js'
import { TutorialTopicModel, TutorialLessonModel } from '../models/Tutorial.js'
import { SupportMessageModel } from '../models/SupportMessage.js'
import * as invites from '../services/teamInvite.service.js'
import { ConversationModel } from '../models/Conversation.js'
import { ConversationMessageModel } from '../models/ConversationMessage.js'
import * as teams from '../services/team.service.js'
import * as admin from '../services/adminPanel.service.js'
import * as cart from '../services/cart.service.js'
import * as payments from '../services/payment.service.js'
import * as support from '../services/support.service.js'
import * as devices from '../services/proPresenterDevice.service.js'
import * as renewal from '../services/proPresenterRenewal.service.js'
import * as waitlist from '../services/proPresenterWaitlist.service.js'
import * as yandex from '../services/yandex360.service.js'
import * as tutorials from '../services/tutorial.service.js'
import * as access from '../services/adminAccess.service.js'
import * as conversations from '../services/conversation.service.js'
import { adminReplaceDevice } from '../services/adminDevice.service.js'
import { createProtectedChatInvite } from '../services/groupJoinAccess.service.js'
import { packCb } from '../core/callback.js'
import { ADMIN_PERMISSION_META } from '../constants/admin-access.js'
import { SUB_STATUSES } from '../constants/admin-panel.js'
import { choice, id, integer, string, type Route, type BodySchema, type ApiContext } from './contract.js'
import { ApiError, objectId, positiveInteger, found, pagination } from './http.js'
import { adminUser, domain, list, memberTeam, myTeams, plain, teamData, visibleTeams } from './resources.js'
import { serializeCart, serializeConversation, serializeDevice, serializeDeviceRequest, serializeLesson, serializePayment, serializeStream, serializeSupportMessage, serializeSupportTicket, serializeSubscription, serializeUser } from './serializers.js'

const routes: Route[] = []
const body = (properties: BodySchema['properties'], required = Object.keys(properties)): BodySchema => ({ properties, required })
const add = (method: string, path: string, summary: string, handle: Route['handle'], permission?: Route['permission'], schema?: BodySchema, maxBytes?: number) => routes.push({ method, path, summary, handle, permission, body: schema, maxBytes })
const uid = (c: ApiContext) => c.session.user.id
const actor = (c: ApiContext) => ({ api: c.telegram, from: { id: uid(c) }, session: {} as Record<string, unknown> })
const tid = (c: ApiContext) => objectId(c.params.teamId)
const pid = (c: ApiContext) => objectId(c.params.id)
const flow = (c: ApiContext) => positiveInteger(c.params.flow)
const notify = async (operation: () => Promise<unknown>) => {
  try { await operation(); return { status: 'sent' } }
  catch { return { status: 'failed', code: 'TELEGRAM_DELIVERY_FAILED' } }
}
const product = (value: string) => { if (!getProduct(value)) throw new ApiError(422, 'INVALID_PRODUCT', 'Unknown product'); return value }
const date = (value: string) => {
  if (value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError(422, 'INVALID_DATE', 'Use an ISO UTC date or an empty string to clear')
  const parsed = new Date(value)
  if (parsed.toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw new ApiError(422, 'INVALID_DATE', 'Invalid calendar date')
  return parsed
}
const dateField = { ...string(30), minLength: 0 }

add('GET', '/api/me', 'Current profile', async c => ({ data: { ...serializeUser(c.user), telegramId: uid(c), avatarUrl: c.session.user.photo_url || null, admin: c.access ? { role: c.access.role, permissions: c.access.permissions } : null } }))
add('PATCH', '/api/me', 'Update profile fields', async c => {
  const updates = Object.fromEntries(Object.entries(c.body).map(([key, value]) => [key, String(value).trim()]))
  await UserModel.updateOne({ telegramId: uid(c) }, { $set: updates }, { runValidators: true })
  for (const [field, value] of Object.entries(updates)) await auditLogService.createLog({ type: 'user.profile_updated', actorType: 'user', actorTelegramId: uid(c), targetUserId: uid(c), metadata: { field, previousValue: c.user[field], newValue: value } })
  return { data: serializeUser(found(await UserModel.findOne({ telegramId: uid(c) }))) }
}, undefined, body({ fio: string(200), city: string(200), church: string(200) }, []))
add('GET', '/api/teams', 'My teams', async c => ({ data: await myTeams(uid(c)) }))
add('POST', '/api/teams', 'Create my team', async c => ({ data: (await teamData([await domain(() => teams.createTeamForUser({ userId: uid(c), name: c.body.name }))], uid(c)))[0], status: 201 }), undefined, body({ name: string(50) }))
add('GET', '/api/teams/:teamId', 'Team details for an active member', async c => ({ data: (await teamData([await memberTeam(c)], uid(c)))[0] }))
add('PATCH', '/api/teams/:teamId', 'Owner renames team', async c => {
  const team = await memberTeam(c, true); const previousName = team.name; team.name = teams.validateTeamName(c.body.name); await team.save()
  await auditLogService.createLog({ type: 'team.updated', actorType: 'user', actorTelegramId: uid(c), targetTeamId: team.id, metadata: { previousName, teamName: team.name } })
  return { data: (await teamData([team], uid(c)))[0] }
}, undefined, body({ name: string(50) }))
add('GET', '/api/products', 'Live product catalogue and entitlements', async c => {
  const userTeams = await visibleTeams(uid(c))
  const active = new Set(userTeams.flatMap(team => [...team.subscriptions.entries()].filter(([, sub]) => sub.status === 'active' && (!sub.expiresAt || sub.expiresAt > new Date())).map(([key]) => key)))
  return { data: Object.values(PRODUCTS).filter(p => p.id !== 'add_member').map(({ groupId, ...p }) => ({ ...p, active: active.has(p.id) })) }
})
add('POST', '/api/teams/:teamId/access/:productId', 'Issue protected Telegram chat invite', async c => {
  await memberTeam(c); product(c.params.productId)
  const invite = found(await domain(() => createProtectedChatInvite(c.telegram, c.params.productId, uid(c))))
  return { data: { url: invite.invite_link, expiresAt: invite.expire_date } }
}, undefined, body({}))
add('GET', '/api/teams/:teamId/cart', 'Team cart', async c => { await memberTeam(c); return { data: serializeCart(await cart.getOrCreateCart(tid(c))) } })
add('POST', '/api/teams/:teamId/cart/items', 'Owner adds product to cart', async c => {
  await memberTeam(c, true); product(c.body.productId)
  if (await teams.isTeamProductPurchaseLocked(tid(c), c.body.productId)) throw new ApiError(409, 'PURCHASE_LOCKED', 'Subscription is already active')
  await domain(() => cart.addToCart(tid(c), c.body.productId)); return { data: serializeCart(await cart.getOrCreateCart(tid(c))) }
}, undefined, body({ productId: string(50) }))
add('DELETE', '/api/teams/:teamId/cart/items/:id', 'Owner removes pending cart item', async c => {
  await memberTeam(c, true); const { item } = await cart.findCartItem(tid(c), pid(c)); found(item)
  if (item!.status !== 'pending') throw new ApiError(409, 'ITEM_LOCKED', 'Only pending items can be removed')
  return { data: serializeCart(await cart.removeFromCart(tid(c), pid(c))) }
})
add('GET', '/api/payments', 'My payment history', c => list(PaymentModel, c.query, { userId: uid(c) }, serializePayment))
add('GET', '/api/payments/:id', 'My payment', async c => ({ data: serializePayment(found(await PaymentModel.findOne({ _id: pid(c), userId: uid(c) }))) }))

const receiptBody = body({ teamId: id, productId: string(50), currency: choice(['rub', 'usd']), paymentMethod: choice(getPaymentOptions().map(option => option.id)), operation: choice(['purchase', 'renewal']), receiptBase64: string(7_000_000), fileName: { ...string(100), pattern: '^[a-zA-Z0-9_.-]+\\.(pdf|png|jpg|jpeg)$' }, cartItemId: id, renewalCampaignId: id, renewalDeviceIds: { type: 'array', items: id, maxItems: 100 } }, ['teamId', 'productId', 'currency', 'paymentMethod', 'operation', 'receiptBase64', 'fileName'])
add('POST', '/api/payments', 'Submit a receipt for manual approval', async c => {
  const option = getPaymentOptions().find(option => option.id === c.body.paymentMethod)
  if (!option || option.currency !== c.body.currency || (!option.configured && process.env.HUB_API_DEMO !== 'true')) throw new ApiError(422, 'INVALID_PAYMENT_METHOD', 'Payment option is unavailable or has a different currency')
  c.params.teamId = c.body.teamId; const team = await memberTeam(c, true); product(c.body.productId)
  if (!c.body.renewalCampaignId && c.body.operation === 'renewal' && c.body.productId === 'propresenter') throw new ApiError(422, 'CAMPAIGN_REQUIRED', 'A ProPresenter renewal campaign is required')
  if (!c.body.renewalCampaignId && await teams.isTeamProductPurchaseLocked(team.id, c.body.productId)) throw new ApiError(409, 'PURCHASE_LOCKED', 'Subscription is already active')
  if (c.body.productId === 'propresenter' && !c.body.renewalCampaignId) throw new ApiError(422, 'WAITLIST_REQUIRED', 'Use the ProPresenter request queue')
  if (c.body.renewalCampaignId && c.body.operation !== 'renewal') throw new ApiError(422, 'INVALID_OPERATION', 'Campaign payments must use renewal')
  if (c.body.cartItemId) {
    const { item } = await cart.findCartItem(team.id, c.body.cartItemId)
    if (!item || item.product !== c.body.productId || item.status !== 'pending') throw new ApiError(409, 'ITEM_LOCKED', 'Cart item is not available for payment')
  }
  const existing = await PaymentModel.findOne({ userId: uid(c), teamId: team.id, productId: c.body.productId, operation: c.body.operation, status: { $in: ['pending', 'processing'] } })
  if (existing) return { data: serializePayment(existing), applied: false }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(c.body.receiptBase64)) throw new ApiError(422, 'INVALID_RECEIPT', 'Use base64 file contents')
  const buffer = Buffer.from(c.body.receiptBase64, 'base64')
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new ApiError(422, 'INVALID_RECEIPT', 'Receipt must contain 1 byte to 5 MiB')
  const valid = c.body.fileName.endsWith('.pdf') ? buffer.subarray(0, 5).toString() === '%PDF-' : c.body.fileName.endsWith('.png') ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (!valid) throw new ApiError(422, 'INVALID_RECEIPT', 'File signature does not match its extension')
  const sent = await c.telegram.sendDocument(ADMIN_GROUP_ID, new InputFile(buffer, c.body.fileName), { caption: `🌐 Чек · ${uid(c)} · ${team.name} · ${c.body.productId}` })
  const payment = await domain(() => payments.createPayment({ userId: uid(c), teamId: team.id, productId: c.body.productId, currency: c.body.currency, paymentMethod: c.body.paymentMethod, operation: c.body.operation, cartItemId: c.body.cartItemId, renewalCampaignId: c.body.renewalCampaignId, renewalDeviceIds: c.body.renewalDeviceIds, receipt: { type: 'document', telegramFileId: sent.document!.file_id, fileName: c.body.fileName, mimeType: sent.document!.mime_type } }))
  await payments.attachPaymentTelegramLocation(payment!.id, { messageId: sent.message_id })
  if (c.body.cartItemId) await cart.setCartItemStatus(team.id, c.body.cartItemId, 'in_review')
  if (c.body.renewalCampaignId) await renewal.setRenewalPaymentStatus(c.body.renewalCampaignId, team.id, payment!.id, 'pending', c.body.renewalDeviceIds)
  const delivery = await notify(() => c.telegram.editMessageReplyMarkup(ADMIN_GROUP_ID, sent.message_id, { reply_markup: new InlineKeyboard().text('✅ Принять', packCb({ a: 'cart_accept', p: payment!.id })).text('❌ Отклонить', packCb({ a: 'cart_reject', p: payment!.id })) }))
  return { data: serializePayment(payment), applied: true, delivery, status: 201 }
}, undefined, receiptBody, 7_100_000)

for (const adminMode of [false, true]) {
  const base = adminMode ? '/api/admin/support' : '/api/support/conversations'
  const permission = adminMode ? 'support.view' : undefined
  add('GET', base, adminMode ? 'All support tickets' : 'My support tickets', c => list(SupportTicketModel, c.query, adminMode ? {} : { userId: uid(c) }, ticket => ({ ...serializeSupportTicket(ticket), ...(adminMode ? { userId: ticket.userId } : {}) })), permission)
  if (!adminMode) add('POST', base, 'Open support ticket', async c => ({ data: serializeSupportTicket(await support.createSupportTicketForUser(c.telegram, uid(c), { username: c.session.user.username })) }), undefined, body({}))
  add('GET', `${base}/:id`, 'Support ticket and messages', async c => {
    const result = found(await support.getSupportTicketWithMessages(pid(c), adminMode ? undefined : uid(c)))
    return { data: { ...serializeSupportTicket(result.ticket), ...(adminMode ? { userId: result.ticket.userId } : {}), messages: result.messages.map(serializeSupportMessage) } }
  }, permission)
  add('POST', `${base}/:id/messages`, 'Send support message to Telegram and web', async c => {
    const result = found(await support.getSupportTicketWithMessages(pid(c), adminMode ? undefined : uid(c)))
    if (result.ticket.status !== 'open') throw new ApiError(409, 'CONVERSATION_CLOSED', 'Conversation is closed')
    const text = c.body.text.trim()
    const sent = await c.telegram.sendMessage(adminMode ? result.ticket.userId : SUPPORT_GROUP_ID, text, adminMode ? {} : { message_thread_id: result.ticket.threadId })
    const message = await support.saveSupportMessage({ ticketId: pid(c), senderType: adminMode ? 'admin' : 'user', senderId: uid(c), text, source: 'web', telegramDestinationMessageId: sent.message_id })
    const delivery = adminMode ? await notify(() => c.telegram.sendMessage(SUPPORT_GROUP_ID, `🌐 ${text}`, { message_thread_id: result.ticket.threadId })) : { status: 'sent' }
    return { data: serializeSupportMessage(message), delivery, status: 201 }
  }, adminMode ? 'support.reply' : undefined, body({ text: string(4000) }))
  add('POST', `${base}/:id/close`, 'Close support ticket in both channels', async c => {
    found(await support.getSupportTicketWithMessages(pid(c), adminMode ? undefined : uid(c)))
    const ticket = await support.closeSupportTicket(c.telegram, pid(c), adminMode ? 'admin' : 'user')
    return { data: serializeSupportTicket(ticket || found((await support.getSupportTicketWithMessages(pid(c)))?.ticket)), applied: Boolean(ticket) }
  }, adminMode ? 'support.reply' : undefined, body({}))
  if (adminMode) add('POST', `${base}/:id/reopen`, 'Reopen support ticket', async c => {
    const previous = found((await support.getSupportTicketWithMessages(pid(c)))?.ticket)
    const ticket = await support.reopenSupportTicket(c.telegram, pid(c), uid(c))
    return { data: serializeSupportTicket(ticket || previous), applied: Boolean(ticket) }
  }, 'support.reply', body({}))
}

add('GET', '/api/teams/:teamId/devices', 'Devices and pending requests', async c => {
  await memberTeam(c)
  const [items, requests] = await Promise.all([devices.listTeamDevices(tid(c)), devices.listTeamDeviceRequests(tid(c))])
  return { data: { devices: items.map(serializeDevice), requests: requests.map(serializeDeviceRequest) } }
})
add('GET', '/api/device-flows', 'Available ProPresenter flows without credentials', async () => ({ data: (await devices.availableDeviceFlows()).map(serializeStream) }))
add('POST', '/api/teams/:teamId/devices/:id/replace', 'Owner replaces device while preserving payment identity', async c => {
  await memberTeam(c, true); const result = await domain(() => devices.replaceTeamDevice({ teamId: tid(c), deviceId: pid(c), requesterId: uid(c), name: c.body.name }))
  return { data: serializeDevice(result.device) }
}, undefined, body({ name: string(80) }))
add('POST', '/api/teams/:teamId/device-requests', 'Request device addition or release', async c => {
  await memberTeam(c, true)
  // Telegram currently disables moves; do not introduce a different web policy.
  const request = await domain(() => devices.createDeviceRequest({ ...c.body, teamId: tid(c), requesterId: uid(c) }))
  const delivery = await notify(async () => {
    const sent = await c.telegram.sendMessage(ADMIN_GROUP_ID, `🌐 Заявка на устройство · ${request.deviceName} · ${request.action}\nКоманда ${request.teamId} · ${uid(c)}`, { message_thread_id: devices.DEVICE_REQUEST_THREAD_ID || undefined, reply_markup: new InlineKeyboard().text('✅ Подтвердить', `dv:approve:${request.id}`).text('❌ Отклонить', `dv:reject:${request.id}`) })
    request.adminMessageId = sent.message_id; await request.save()
  })
  return { data: serializeDeviceRequest(request), delivery, status: 201 }
}, undefined, body({ action: choice(['add', 'release']), deviceId: id, deviceName: string(80), replacesDeviceId: id, toFlow: integer }, ['action']))
add('GET', '/api/teams/:teamId/propresenter-requests', 'Team queue requests', async c => { await memberTeam(c); return list(ProPresenterWaitlistModel, c.query, { teamId: tid(c) }) })
add('POST', '/api/teams/:teamId/propresenter-requests', 'Owner joins ProPresenter queue', async c => {
  await memberTeam(c, true); const result = await domain(() => waitlist.addToWaitlist(tid(c), uid(c)))
  const delivery = await notify(() => c.telegram.sendMessage(ADMIN_GROUP_ID, `🌐 Заявка ProPresenter · ${tid(c)} · ${uid(c)}`))
  return { data: { ...plain(result.entry), position: result.position }, applied: result.created, delivery, status: result.created ? 201 : 200 }
}, undefined, body({}))
async function renewalViews(userId: number, userTeams?: any[]) {
  const teamRecords = userTeams || await visibleTeams(userId)
  const deviceRecords = await ProPresenterDeviceModel.find({ teamId: { $in: teamRecords.map(team => team.id) }, status: 'active' })
  const flows = [...new Set([...deviceRecords.map(device => device.flowNumber), ...teamRecords.flatMap(team => [...team.subscriptions.values()].map((sub: any) => Number(sub.meta?.flowNumber)).filter(Boolean))])]
  const campaigns = (await ProPresenterRenewalCampaignModel.find({ flowNumber: { $in: flows }, status: { $in: ['active', 'completed'] } })).filter(renewal.renewalAcceptsNewPayments)
  return Promise.all(campaigns.map(async campaign => ({ id: campaign.id, flowNumber: campaign.flowNumber, cycleEndsAt: campaign.cycleEndsAt, status: campaign.status, billingMode: campaign.billingMode, priceRub: campaign.priceRub, priceUsd: campaign.priceUsd, seats: (await renewal.eligibleSeats(campaign.id, userId)).map(plain) })))
}
add('GET', '/api/renewals', 'My eligible renewal campaigns and devices', async c => ({ data: await renewalViews(uid(c)) }))
add('POST', '/api/renewals/:id/devices/:deviceId/vote', 'Vote for a renewal device', async c => {
  const result = await domain(() => renewal.voteForDevice(c.telegram, pid(c), objectId(c.params.deviceId), uid(c), c.body.vote))
  return { data: result }
}, undefined, body({ vote: choice(['yes', 'no', 'none']) }))
add('GET', '/api/yandex360', 'My Yandex 360 membership', async c => {
  const membership = await yandex.getMyMembership(uid(c))
  if (!membership) return { data: null }
  const { member, stream } = membership
  return { data: { id: member.id, name: member.name, emails: member.emails.map(e => ({ id: String(e._id), address: e.address, status: e.status })), stream: stream ? { id: stream.id, name: stream.name, status: stream.status, startsAt: stream.startsAt, endsAt: stream.endsAt } : null, requests: (await Yandex360RequestModel.find({ memberId: member._id }).sort({ createdAt: -1 }).limit(100)).map(plain) } }
})
add('POST', '/api/yandex360/email-requests', 'Request or replace Yandex email', async c => {
  const request = await domain(() => yandex.requestEmail(uid(c), c.body.email, c.body.oldEmailId))
  const delivery = await notify(() => c.telegram.sendMessage(ADMIN_GROUP_ID, `🌐 Яндекс 360 · ${uid(c)} · ${request.proposedEmail}\nЗаявка ${request.id}`))
  return { data: plain(request), delivery, status: 201 }
}, undefined, body({ email: string(254), oldEmailId: id }, ['email']))

add('GET', '/api/tutorials/topics', 'Tutorial topics', async () => ({ data: (await tutorials.listTopics()).map(plain) }))
add('GET', '/api/tutorials/topics/:id/lessons', 'Published lessons in a topic', async c => ({ data: (await tutorials.listLessons(pid(c), true)).map(serializeLesson) }))
add('GET', '/api/tutorials/lessons/:id', 'Published lesson', async c => ({ data: serializeLesson(found(await tutorials.getLesson(pid(c), true))) }))

add('GET', '/api/admin/session', 'Administrator role and exact permissions', async c => ({ data: { user: adminUser(c.user), isAdmin: true, role: c.access!.role, permissions: c.access!.permissions, permissionMeta: ADMIN_PERMISSION_META } }), 'admin')
add('GET', '/api/admin/users', 'Paginated users and search', async c => {
  const q = c.query.get('q')?.trim(); const filter = q ? { $or: [{ fio: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { username: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, ...(/^\d+$/.test(q) ? [{ telegramId: Number(q) }] : [])] } : {}
  return list(UserModel, c.query, filter, adminUser)
}, 'users.view')
add('GET', '/api/admin/users/:userId', 'User profile', async c => ({ data: adminUser(found(await admin.adminGetUser(positiveInteger(c.params.userId)))) }), 'users.view')
add('PATCH', '/api/admin/users/:userId', 'Edit user field through shared admin service', async c => {
  found(await admin.adminGetUser(positiveInteger(c.params.userId)))
  await domain(() => admin.adminUpdateUserField(positiveInteger(c.params.userId), c.body.field, c.body.value.trim(), uid(c)))
  return { data: adminUser(found(await admin.adminGetUser(positiveInteger(c.params.userId)))) }
}, 'users.edit', body({ field: choice(['fio', 'city', 'church', 'username']), value: string(200) }))
add('DELETE', '/api/admin/users/:userId', 'Delete profile and associated teams', async c => ({ data: found(await domain(() => admin.adminDeleteUser(positiveInteger(c.params.userId), uid(c)))) }), 'users.edit')
add('GET', '/api/admin/teams', 'Paginated teams', async c => {
  const { page, limit, skip } = pagination(c.query)
  const q = c.query.get('q')?.trim(); const filter = q ? { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {}
  const [items, total] = await Promise.all([TeamModel.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit), TeamModel.countDocuments(filter)])
  return { data: await teamData(items, uid(c), true, c.access!.permissions.includes('subscriptions.view')), meta: { page, limit, total } }
}, 'teams.view')
add('POST', '/api/admin/teams', 'Create a team for a registered user', async c => ({ data: (await teamData([await domain(() => teams.createTeamForUser({ userId: c.body.ownerId, name: c.body.name, createdByAdminId: uid(c) }))], uid(c), true, c.access!.permissions.includes('subscriptions.view')))[0], status: 201 }), 'teams.edit', body({ ownerId: integer, name: string(50) }))
add('GET', '/api/admin/teams/:teamId', 'Admin team card', async c => ({ data: (await teamData([found(await admin.adminGetTeam(tid(c)))], uid(c), true, c.access!.permissions.includes('subscriptions.view')))[0] }), 'teams.view')
add('PATCH', '/api/admin/teams/:teamId', 'Rename team', async c => {
  await domain(() => admin.adminUpdateTeamName(tid(c), teams.validateTeamName(c.body.name), uid(c)))
  return { data: { id: tid(c), name: c.body.name } }
}, 'teams.edit', body({ name: string(50) }))
add('DELETE', '/api/admin/teams/:teamId', 'Delete team through shared service', async c => ({ data: found(await domain(() => admin.adminDeleteTeam(tid(c), uid(c)))) }), 'teams.edit')
add('POST', '/api/admin/teams/:teamId/owner', 'Transfer ownership', async c => { await domain(() => admin.adminTransferOwnership(tid(c), c.body.telegramId, uid(c))); return { data: { id: tid(c), ownerId: c.body.telegramId } } }, 'teams.edit', body({ telegramId: integer }))
add('POST', '/api/admin/teams/:teamId/members', 'Add team member', async c => { await domain(() => admin.adminAddTeamMember(tid(c), c.body.telegramId, uid(c))); return { data: { telegramId: c.body.telegramId } } }, 'teams.edit', body({ telegramId: integer }))
add('DELETE', '/api/admin/teams/:teamId/members/:userId', 'Remove member', async c => { await domain(() => admin.adminRemoveTeamMember(tid(c), positiveInteger(c.params.userId), uid(c))); return { data: { removed: true } } }, 'teams.edit')
for (const action of ['status', 'expiry', 'extend', 'reset'] as const) {
  const schemas = { status: body({ status: choice(SUB_STATUSES) }), expiry: body({ expiresAt: dateField }), extend: body({ months: { ...integer, maximum: 120 } }), reset: body({}) }
  add('POST', `/api/admin/teams/:teamId/subscriptions/:productId/${action}`, `Subscription ${action}`, async c => {
    product(c.params.productId)
    await domain<any>(() => action === 'status' ? admin.adminSetTeamSubStatus(tid(c), c.params.productId, c.body.status, uid(c)) : action === 'expiry' ? admin.adminSetTeamSubExpiry(tid(c), c.params.productId, date(c.body.expiresAt), uid(c)) : action === 'extend' ? admin.adminExtendTeamSub(tid(c), c.params.productId, c.body.months, uid(c)) : admin.adminResetTeamSub(tid(c), c.params.productId, uid(c)))
    const team = found(await teams.getTeamById(tid(c)))
    return { data: (await teamData([team], uid(c)))[0].subscriptions }
  }, 'subscriptions.edit', schemas[action])
}
add('GET', '/api/admin/payments', 'Paginated payment queue', c => list(PaymentModel, c.query, {}, serializePayment), 'payments.view')
add('GET', '/api/admin/payments/:id', 'Payment card', async c => ({ data: serializePayment(found(await payments.getPayment(pid(c)))) }), 'payments.view')
for (const action of ['accept', 'reject', 'retry'] as const) add('POST', `/api/admin/payments/:id/${action}`, `Payment ${action}`, async c => {
  found(await payments.getPayment(pid(c)))
  const result = await domain<any>(() => action === 'accept' ? payments.acceptPayment(pid(c), uid(c), 'api') : action === 'reject' ? payments.rejectPayment(pid(c), uid(c), c.body.reason.trim(), 'api') : payments.returnPaymentToPending(pid(c), uid(c)))
  const delivery = action !== 'retry' ? await notifyPaymentDecision(c.telegram, result).catch(() => ({ status: 'queued', code: 'OUTBOX_UNAVAILABLE' })) : { status: 'not_required' }
  if (result.payment.renewalCampaignId) await notify(() => renewal.syncRenewalSummary(c.telegram, result.payment.renewalCampaignId))
  if (result.payment.telegramAdminMessageId) await notify(() => c.telegram.editMessageReplyMarkup(ADMIN_GROUP_ID, result.payment.telegramAdminMessageId, { reply_markup: result.payment.status === 'pending' ? new InlineKeyboard().text('✅ Принять', packCb({ a: 'cart_accept', p: result.payment.id })).text('❌ Отклонить', packCb({ a: 'cart_reject', p: result.payment.id })) : new InlineKeyboard().text(result.payment.status, packCb({ a: 'noop' })) }))
  return { data: serializePayment(result.payment), applied: result.applied, delivery }
}, 'payments.manage', action === 'reject' ? body({ reason: string(1000) }) : body({}))

add('GET', '/api/admin/device-requests', 'Device approval queue', c => list(ProPresenterDeviceRequestModel, c.query, {}, serializeDeviceRequest), 'requests.view')
for (const action of ['approve', 'reject']) add('POST', `/api/admin/device-requests/:id/${action}`, `Device request ${action}`, async c => {
  const before = found(await ProPresenterDeviceRequestModel.findById(pid(c)))
  if (before.status !== 'pending') return { data: serializeDeviceRequest(before), applied: false }
  const request = await domain(() => devices.decideDeviceRequest(pid(c), uid(c), action === 'approve'))
  const delivery = await notify(() => c.telegram.sendMessage(request.requestedBy, `Заявка на устройство «${request.deviceName}»: ${action === 'approve' ? 'подтверждена' : 'отклонена'}`))
  return { data: serializeDeviceRequest(request), applied: true, delivery }
}, 'requests.edit', body({}))
add('GET', '/api/admin/devices', 'All devices', c => list(ProPresenterDeviceModel, c.query, {}, serializeDevice), 'streams.view')
add('POST', '/api/admin/devices', 'Create approved device', async c => ({ data: serializeDevice(await domain(() => devices.createApprovedDevice({ name: c.body.name, teamId: c.body.teamId, flowNumber: c.body.flowNumber, adminId: uid(c) }))), status: 201 }), 'streams.edit', body({ name: string(80), teamId: id, flowNumber: integer }))
add('POST', '/api/admin/devices/:id/replace', 'Admin replaces device', async c => {
  const device = found(await ProPresenterDeviceModel.findById(pid(c)))
  const result = await domain(() => adminReplaceDevice({ deviceId: pid(c), teamId: device.teamId, name: c.body.name, adminId: uid(c) }))
  return { data: serializeDevice(result) }
}, 'streams.edit', body({ name: string(80) }))
add('POST', '/api/admin/devices/:id/release', 'Release device', async c => ({ data: serializeDevice(await domain(() => devices.applyDeviceChange(pid(c), 'release', undefined, uid(c)))) }), 'streams.edit', body({}))
add('GET', '/api/admin/propresenter-requests', 'ProPresenter queue', c => list(ProPresenterWaitlistModel, c.query), 'requests.view')
add('POST', '/api/admin/propresenter-requests/:id/cancel', 'Cancel queue request', async c => ({ data: plain(found(await domain(() => waitlist.cancelWaitlistEntry(pid(c))))) }), 'requests.edit', body({}))
add('GET', '/api/admin/streams', 'ProPresenter streams without passwords', async () => ({ data: (await admin.adminGetAllStreams()).map(serializeStream) }), 'streams.view')
add('GET', '/api/admin/streams/:flow', 'Stream card', async c => ({ data: serializeStream(found(await admin.adminGetStream(flow(c)))) }), 'streams.view')
add('POST', '/api/admin/streams', 'Create ProPresenter stream', async c => ({ data: serializeStream(await domain(() => admin.adminCreateStream({ ...c.body, adminTelegramId: uid(c) }))), status: 201 }), 'streams.edit', body({ email: string(254), password: string(500), chatLink: { ...string(500), pattern: '^https://t\\.me/' }, capacity: { ...integer, maximum: 10000 } }, ['email', 'password']))
add('PATCH', '/api/admin/streams/:flow', 'Update stream and shared team credentials', async c => ({ data: serializeStream(found(await domain(() => admin.adminUpdateStream(flow(c), c.body)))) }), 'streams.edit', body({ email: string(254), password: string(500), chatLink: { ...string(500), pattern: '^https://t\\.me/' }, capacity: { ...integer, maximum: 10000 }, status: choice(['active', 'closed']) }, []))
add('POST', '/api/admin/streams/:flow/expiry', 'Change stream expiry and associated teams', async c => ({ data: serializeStream(found(await domain(() => admin.adminSetStreamExpiry(flow(c), date(c.body.expiresAt), uid(c))))) }), 'streams.edit', body({ expiresAt: dateField }))
add('POST', '/api/admin/streams/:flow/teams', 'Assign team to stream', async c => { await domain(() => admin.adminAddTeamToStream(c.body.teamId, flow(c), uid(c))); return { data: { teamId: c.body.teamId } } }, 'streams.edit', body({ teamId: id }))
add('POST', '/api/admin/streams/from-waitlist', 'Create stream from request batch', async c => {
  const result = await domain(() => admin.adminCreateStreamFromWaitlist({ ...c.body, expiresAt: found(date(c.body.expiresAt)), adminTelegramId: uid(c) }))
  return { data: { stream: serializeStream(result.stream), requests: result.entries.map(plain) }, status: 201 }
}, 'streams.edit', body({ flowNumber: integer, email: string(254), password: string(500), chatLink: { ...string(500), pattern: '^https://t\\.me/' }, expiresAt: dateField }, ['flowNumber', 'email', 'password', 'expiresAt']))
add('GET', '/api/admin/renewals', 'Renewal campaigns', c => list(ProPresenterRenewalCampaignModel, c.query, {}, x => ({ id: x.id, flowNumber: x.flowNumber, status: x.status, billingMode: x.billingMode, cycleEndsAt: x.cycleEndsAt, priceRub: x.priceRub, priceUsd: x.priceUsd, completedAt: x.completedAt })), 'streams.view')
add('POST', '/api/admin/streams/:flow/renewals', 'Launch renewal campaign', async c => ({ data: plain(await domain(() => renewal.launchRenewal(c.telegram, flow(c), uid(c)))) }), 'streams.edit', body({}))
add('POST', '/api/admin/renewals/:id/complete', 'Complete renewal campaign', async c => ({ data: await domain(() => renewal.completeRenewal(c.telegram, pid(c), uid(c))) }), 'streams.edit', body({}))

add('GET', '/api/admin/yandex360/streams', 'Yandex streams', c => list(Yandex360StreamModel, c.query), 'streams.view')
add('POST', '/api/admin/yandex360/streams', 'Create Yandex stream', async c => ({ data: plain(await domain(() => yandex.createStream(uid(c), c.body.name))), status: 201 }), 'streams.edit', body({ name: string(200) }))
add('PATCH', '/api/admin/yandex360/streams/:id', 'Edit Yandex stream field', async c => ({ data: plain(await domain(() => yandex.updateStream(uid(c), pid(c), c.body.field, c.body.value))) }), 'streams.edit', body({ field: choice(['name', 'endsAt', 'chatLink', 'status', 'capacity', 'adminEmail', 'amount']), value: { ...string(500), minLength: 0 } }))
add('GET', '/api/admin/yandex360/members', 'Yandex members', c => list(Yandex360MemberModel, c.query), 'streams.view')
add('POST', '/api/admin/yandex360/members', 'Create Yandex member', async c => ({ data: plain(await domain(() => yandex.createMember(uid(c), c.body))), status: 201 }), 'streams.edit', body({ name: string(200), streamId: id, telegramId: integer }, ['name', 'streamId']))
add('PATCH', '/api/admin/yandex360/members/:id', 'Edit Yandex member field', async c => ({ data: plain(await domain(() => yandex.updateMember(uid(c), pid(c), c.body.field, c.body.value))) }), 'streams.edit', body({ field: choice(['name', 'username', 'seats', 'amount', 'note', 'streamId']), value: { ...string(2000), minLength: 0 } }))
add('POST', '/api/admin/yandex360/members/:id/link', 'Link known Telegram user', async c => ({ data: plain(await domain(() => yandex.linkMember(uid(c), pid(c), c.body.telegramId))) }), 'streams.edit', body({ telegramId: integer }))
add('POST', '/api/admin/yandex360/members/:id/emails', 'Admin adds email', async c => ({ data: plain(await domain(() => yandex.addAdminEmail(uid(c), pid(c), c.body.email))) }), 'streams.edit', body({ email: string(254) }))
add('POST', '/api/admin/yandex360/members/:id/emails/:emailId/status', 'Change email status', async c => { const result = await domain(() => yandex.setAdminEmailStatus(uid(c), pid(c), objectId(c.params.emailId), c.body.action)); return { data: plain(result.member), applied: result.changed } }, 'streams.edit', body({ action: choice(['approve', 'reject', 'disable']) }))
add('GET', '/api/admin/yandex360/requests', 'Yandex email approval queue', c => list(Yandex360RequestModel, c.query), 'requests.view')
for (const action of ['approve', 'reject']) add('POST', `/api/admin/yandex360/requests/:id/${action}`, `Yandex request ${action}`, async c => {
  const request = found(await Yandex360RequestModel.findById(pid(c)))
  const result = await domain(() => yandex.decideEmail(uid(c), pid(c), action === 'approve'))
  const delivery = result.changed && result.member?.telegramId ? await notify(() => c.telegram.sendMessage(result.member!.telegramId!, `Яндекс 360: ${request.proposedEmail} · ${action === 'approve' ? 'подтверждено' : 'отклонено'}`)) : { status: 'not_required' }
  return { data: result.member ? plain(result.member) : null, applied: result.changed, delivery }
}, 'requests.edit', body({}))

add('GET', '/api/admin/tutorials/topics', 'Admin tutorial topics', async () => ({ data: (await tutorials.listTopics()).map(plain) }), 'tutorials.view')
add('POST', '/api/admin/tutorials/topics', 'Create tutorial topic', async c => ({ data: plain(await domain(() => tutorials.createTopic(c.body.title))), status: 201 }), 'tutorials.edit', body({ title: string(200) }))
add('PATCH', '/api/admin/tutorials/topics/:id', 'Rename topic', async c => ({ data: plain(found(await TutorialTopicModel.findByIdAndUpdate(pid(c), { $set: c.body }, { new: true, runValidators: true }))) }), 'tutorials.edit', body({ title: string(200) }))
add('DELETE', '/api/admin/tutorials/topics/:id', 'Delete topic and lessons', async c => { await tutorials.deleteTopic(pid(c)); return { data: { deleted: true } } }, 'tutorials.edit')
add('GET', '/api/admin/tutorials/topics/:id/lessons', 'All topic lessons including drafts', async c => ({ data: (await tutorials.listLessons(pid(c))).map(serializeLesson) }), 'tutorials.view')
add('POST', '/api/admin/tutorials/topics/:id/lessons', 'Create draft lesson', async c => ({ data: serializeLesson(await domain(() => tutorials.createLesson(pid(c), c.body.title))), status: 201 }), 'tutorials.edit', body({ title: string(200) }))
add('PATCH', '/api/admin/tutorials/lessons/:id', 'Edit lesson and publish status', async c => ({ data: serializeLesson(found(await TutorialLessonModel.findByIdAndUpdate(pid(c), { $set: c.body }, { new: true, runValidators: true }))) }), 'tutorials.edit', body({ title: string(200), description: { ...string(4000), minLength: 0 }, published: { type: 'boolean' } }, []))
add('DELETE', '/api/admin/tutorials/lessons/:id', 'Delete lesson', async c => { await tutorials.deleteLesson(pid(c)); return { data: { deleted: true } } }, 'tutorials.edit')
for (const resource of ['topics', 'lessons']) add('POST', `/api/admin/tutorials/${resource}/:id/move`, 'Reorder tutorial', async c => { await (resource === 'topics' ? tutorials.moveTopic(pid(c), c.body.direction) : tutorials.moveLesson(pid(c), c.body.direction)); return { data: { moved: true } } }, 'tutorials.edit', body({ direction: { type: 'integer', minimum: -1, maximum: 1, enum: [-1, 1] } }))
add('GET', '/api/admin/admins', 'Administrator access records', async () => ({ data: (await access.listAdminAccess()).map(x => ({ telegramId: x.telegramId, role: x.role, permissions: x.permissions, active: x.active, bootstrap: x.bootstrap })) }), 'admins.view')
add('POST', '/api/admin/admins', 'Grant or change administrator role', async c => ({ data: plain(await domain(() => access.upsertAdminAccess({ ...c.body, actorId: uid(c) }))) }), 'admins.manage', body({ telegramId: integer, role: choice(['superadmin', 'admin', 'consultant']), permissions: { type: 'array', items: choice(Object.keys(ADMIN_PERMISSION_META)), maxItems: 30 } }, ['telegramId', 'role']))
add('POST', '/api/admin/admins/:userId/permissions', 'Set exact admin permission', async c => ({ data: plain(await domain(() => access.setAdminPermission({ telegramId: positiveInteger(c.params.userId), permission: c.body.permission, enabled: c.body.enabled, actorId: uid(c) }))) }), 'admins.manage', body({ permission: choice(Object.keys(ADMIN_PERMISSION_META)), enabled: { type: 'boolean' } }))
add('DELETE', '/api/admin/admins/:userId', 'Disable admin access', async c => ({ data: plain(found(await domain(() => access.disableAdminAccess(positiveInteger(c.params.userId), uid(c))))) }), 'admins.manage')

// Poll the same database used by Telegram. No in-memory event bus that loses bot updates.
add('GET', '/api/sync', 'User state snapshot and content revision', async c => {
  const userTeams = await visibleTeams(uid(c)); const teamIds = userTeams.map(t => t.id)
  const [teamViews, paymentViews, deviceViews, requests, tickets, carts, membership, topicViews, lessonViews, renewalData, verifications] = await Promise.all([
    teamData(userTeams, uid(c)), PaymentModel.find({ userId: uid(c) }).sort({ updatedAt: -1 }).limit(100), ProPresenterDeviceModel.find({ teamId: { $in: teamIds } }), ProPresenterDeviceRequestModel.find({ teamId: { $in: teamIds } }).sort({ updatedAt: -1 }).limit(100), SupportTicketModel.find({ userId: uid(c) }).sort({ updatedAt: -1 }).limit(100), CartModel.find({ teamId: { $in: teamIds } }), yandex.getMyMembership(uid(c)), tutorials.listTopics(), TutorialLessonModel.find({ published: true }).select('_id topicId title description published order mediaType mediaFileId updatedAt').sort({ order: 1, _id: 1 }), renewalViews(uid(c), userTeams), ProPresenterVerificationModel.find({ teamId: { $in: teamIds } }).sort({ updatedAt: -1 }).limit(100),
  ])
  const snapshot = { user: serializeUser(c.user), admin: c.access ? { role: c.access.role, permissions: c.access.permissions } : null, teams: teamViews, payments: paymentViews.map(serializePayment), devices: deviceViews.map(serializeDevice), deviceRequests: requests.map(serializeDeviceRequest), support: tickets.map(serializeSupportTicket), carts: carts.map(serializeCart), streamVerifications: verifications.map(verificationData), renewals: renewalData, yandex360: membership ? { stream: membership.stream ? { id: membership.stream.id, name: membership.stream.name, startsAt: membership.stream.startsAt, endsAt: membership.stream.endsAt, status: membership.stream.status, updatedAt: membership.stream.updatedAt } : null, id: membership.member.id, name: membership.member.name, emails: membership.member.emails.map(e => ({ id: String(e._id), address: e.address, status: e.status })), updatedAt: membership.member.updatedAt } : null, tutorials: { topics: topicViews.map(plain), lessons: lessonViews.map(serializeLesson) }, products: Object.values(PRODUCTS).map(({ groupId, ...p }) => p) }
  const revision = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  return { data: { revision, changed: c.query.get('since') !== revision, pollAfterMs: 5000, snapshot: c.query.get('since') === revision ? null : snapshot } }
})


async function download(c: ApiContext, fileId: string) {
  const file = await c.telegram.getFile(fileId)
  if (!file.file_path || (file.file_size || 0) > 20 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', 'File is unavailable or larger than 20 MiB')
  const token = c.telegram.token
  const remote = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(15_000) })
  if (!remote.ok || !remote.body) throw new ApiError(502, 'FILE_UNAVAILABLE', 'Telegram file unavailable')
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of remote.body) {
    size += chunk.length
    if (size > 20 * 1024 * 1024) { await remote.body.cancel().catch(() => {}); throw new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds 20 MiB') }
    chunks.push(Buffer.from(chunk))
  }
  return { data: null, binary: { buffer: Buffer.concat(chunks), contentType: 'application/octet-stream' } }
}
for (const adminMode of [false, true]) {
  add('GET', `${adminMode ? '/api/admin' : '/api'}/payments/:id/receipt`, 'Download receipt through authenticated proxy', async c => {
    const payment = found(await PaymentModel.findOne({ _id: pid(c), ...(adminMode ? {} : { userId: uid(c) }) }))
    return download(c, payment.receipt.telegramFileId)
  }, adminMode ? 'payments.view' : undefined)
  add('GET', `${adminMode ? '/api/admin/support' : '/api/support/conversations'}/:id/messages/:messageId/attachments/:index`, 'Download support attachment', async c => {
    found(await SupportTicketModel.findOne({ _id: pid(c), ...(adminMode ? {} : { userId: uid(c) }) }))
    const message = found(await SupportMessageModel.findOne({ _id: objectId(c.params.messageId), ticketId: pid(c) }))
    if (!/^\d+$/.test(c.params.index)) throw new ApiError(422, 'INVALID_INDEX', 'Invalid attachment index')
    const attachment = found(message.attachments[Number(c.params.index)])
    return download(c, attachment.telegramFileId)
  }, adminMode ? 'support.view' : undefined)
}
add('GET', '/api/tutorials/lessons/:id/media', 'Download published tutorial media', async c => {
  const lesson = found(await tutorials.getLesson(pid(c), true))
  return download(c, found(lesson.mediaFileId))
})
add('GET', '/api/teams/:teamId/invites', 'Owner sees paid member invitations', async c => {
  await memberTeam(c, true)
  const bot = await c.telegram.getMe()
  return { data: (await invites.getTeamInvites(tid(c))).map(invite => ({ id: invite.id, code: invite.code, status: invite.status, usedBy: invite.usedBy, createdAt: invite.createdAt, link: bot.username ? `https://t.me/${bot.username}?start=join_${invite.code}` : null })) }
})
add('GET', '/api/invites/:code', 'Preview invitation without exposing team profiles', async c => {
  if (!/^[a-f\d]{8}$/i.test(c.params.code)) throw new ApiError(422, 'INVALID_CODE', 'Invalid invitation code')
  const result = await invites.validateInvite(c.params.code)
  if (!result.ok) throw new ApiError(404, 'INVITE_UNAVAILABLE', 'Invitation is unavailable')
  return { data: { code: c.params.code, teamName: result.team!.name } }
})
add('POST', '/api/invites/:code/accept', 'Accept a paid single-use invitation', async c => {
  if (!/^[a-f\d]{8}$/i.test(c.params.code)) throw new ApiError(422, 'INVALID_CODE', 'Invalid invitation code')
  const result = await invites.validateInvite(c.params.code)
  if (!result.ok) throw new ApiError(409, 'INVITE_UNAVAILABLE', 'Invitation is unavailable')
  if (result.team!.members.some(m => m.telegramId === uid(c))) throw new ApiError(409, 'ALREADY_MEMBER', 'Already a member')
  const invite = await invites.consumeInvite(c.params.code, uid(c))
  if (!invite) throw new ApiError(409, 'INVITE_UNAVAILABLE', 'Invitation was already used')
  try { await teams.addMemberToTeam(invite.teamId, uid(c)) }
  catch (error) { await invites.restoreInvite(c.params.code, uid(c)); throw error }
  await UserModel.updateOne({ telegramId: uid(c) }, { $set: { pendingInviteCode: null } })
  const delivery = await notify(() => c.telegram.sendMessage(result.team!.ownerId, `${c.user.fio || 'Участник HUB'} присоединился к команде «${result.team!.name}»`))
  return { data: (await teamData([found(await teams.getTeamById(invite.teamId))], uid(c)))[0], delivery }
}, undefined, body({}))

async function paymentConversation(c: ApiContext, adminMode: boolean) {
  const conversation = found(await ConversationModel.findOne({ _id: pid(c), type: 'payment', ...(adminMode ? {} : { userId: uid(c) }) }))
  found(await PaymentModel.findOne({ _id: objectId(conversation.contextId), ...(adminMode ? {} : { userId: uid(c) }) }))
  return conversation
}
add('POST', '/api/admin/payments/:id/conversation', 'Open payment communication with a user', async c => {
  const payment = found(await payments.getPayment(pid(c)))
  const ctx = { ...actor(c), callbackQuery: { message: { chat: { id: ADMIN_GROUP_ID }, message_id: payment.telegramAdminMessageId || 0, message_thread_id: payment.telegramAdminThreadId || undefined } } }
  return { data: serializeConversation(await domain(() => conversations.openConversation(ctx, 'payment', pid(c)))) }
}, 'payments.manage', body({}))
for (const adminMode of [false, true]) {
  const base = adminMode ? '/api/admin/conversations' : '/api/conversations'
  add('GET', base, 'Payment conversations', c => list(ConversationModel, c.query, { type: 'payment', ...(adminMode ? {} : { userId: uid(c) }) }, serializeConversation), adminMode ? 'payments.view' : undefined)
  add('GET', `${base}/:id`, 'Payment conversation with message history', async c => {
    const conversation = await paymentConversation(c, adminMode)
    const messages = await ConversationMessageModel.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(500)
    return { data: { ...serializeConversation(conversation), messages: messages.map(message => ({ id: message.id, direction: message.direction, senderId: message.senderId, source: message.source, text: message.text, attachments: message.attachments.map((a, index) => ({ type: a.type, fileName: a.fileName || null, mimeType: a.mimeType || null, url: `${base}/${conversation.id}/messages/${message.id}/attachments/${index}` })), createdAt: message.createdAt })) } }
  }, adminMode ? 'payments.view' : undefined)
  add('POST', `${base}/:id/messages`, 'Send payment conversation message', async c => {
    const conversation = await paymentConversation(c, adminMode)
    if (conversation.status !== 'open') throw new ApiError(409, 'CONVERSATION_CLOSED', 'Conversation is closed')
    const sent = await c.telegram.sendMessage(adminMode ? conversation.userId : conversation.adminChatId, c.body.text.trim(), adminMode ? {} : { message_thread_id: conversation.adminThreadId || undefined })
    const message = await ConversationMessageModel.create({ conversationId: conversation._id, direction: adminMode ? 'admin_to_user' : 'user_to_admin', senderId: uid(c), source: 'web', text: c.body.text.trim(), telegramSourceMessageId: -sent.message_id, telegramDestinationMessageId: sent.message_id })
    conversation.lastActivityAt = new Date(); await conversation.save()
    const delivery = adminMode ? await notify(() => c.telegram.sendMessage(conversation.adminChatId, `🌐 ${c.body.text.trim()}`, { message_thread_id: conversation.adminThreadId || undefined })) : { status: 'sent' }
    return { data: { id: message.id, text: message.text, direction: message.direction, createdAt: message.createdAt }, delivery, status: 201 }
  }, adminMode ? 'payments.manage' : undefined, body({ text: string(4000) }))
  add('GET', `${base}/:id/messages/:messageId/attachments/:index`, 'Payment message attachment', async c => {
    const conversation = await paymentConversation(c, adminMode)
    const message = found(await ConversationMessageModel.findOne({ _id: objectId(c.params.messageId), conversationId: conversation._id }))
    if (!/^\d+$/.test(c.params.index)) throw new ApiError(422, 'INVALID_INDEX', 'Invalid attachment index')
    return download(c, found(message.attachments[Number(c.params.index)]?.telegramFileId))
  }, adminMode ? 'payments.view' : undefined)
}
for (const action of ['close', 'reopen']) add('POST', `/api/admin/conversations/:id/${action}`, `Payment conversation ${action}`, async c => {
  await paymentConversation(c, true)
  const result = await domain(() => action === 'close' ? conversations.closeConversation(actor(c), pid(c)) : conversations.reopenConversation(actor(c), pid(c)))
  return { data: serializeConversation(result.conversation), applied: result.applied }
}, 'payments.manage', body({}))
add('GET', '/api/admin/sync', 'Permission-filtered admin snapshot revision', async c => {
  const snapshot: Record<string, unknown> = { role: c.access!.role, permissions: c.access!.permissions, products: Object.values(PRODUCTS).map(({ groupId, ...product }) => product) }
  const tasks: Promise<void>[] = []
  const load = (permission: access.AdminPermission, name: string, model: any, serializer: (x: any) => any) => {
    if (c.access!.permissions.includes(permission)) tasks.push(list(model, new URLSearchParams('limit=100'), {}, serializer).then(result => { snapshot[name] = result }))
  }
  load('users.view', 'users', UserModel, adminUser)
  load('payments.view', 'notifications', ApiNotificationModel, n => ({ id: n.id, paymentId: n.paymentId, status: n.status, attempts: n.attempts, nextAttemptAt: n.nextAttemptAt, sentAt: n.sentAt }))
  load('streams.view', 'yandexStreams', Yandex360StreamModel, plain)
  load('streams.view', 'yandexMembers', Yandex360MemberModel, plain)
  load('streams.view', 'renewals', ProPresenterRenewalCampaignModel, campaign => ({ id: campaign.id, flowNumber: campaign.flowNumber, status: campaign.status, cycleEndsAt: campaign.cycleEndsAt, updatedAt: campaign.updatedAt }))
  load('subscriptions.view', 'subscriptions', TeamModel, team => ({ teamId: team.id, subscriptions: [...team.subscriptions.entries()].map(([productId, subscription]: any) => ({ productId, status: subscription.status, expiresAt: subscription.expiresAt, flowNumber: subscription.meta?.flowNumber || null })) }))
  if (c.access!.permissions.includes('tutorials.view')) tasks.push(Promise.all([tutorials.listTopics(), TutorialLessonModel.find().sort({ updatedAt: -1 }).limit(100)]).then(([topics, lessons]) => { snapshot.tutorials = { topics: topics.map(plain), lessons: lessons.map(serializeLesson) } }))
  load('payments.view', 'payments', PaymentModel, serializePayment)
  load('support.view', 'support', SupportTicketModel, t => ({ ...serializeSupportTicket(t), userId: t.userId }))
  load('payments.view', 'conversations', ConversationModel, serializeConversation)
  load('broadcasts.send', 'broadcasts', BroadcastModel, broadcastData)
  load('requests.view', 'streamVerifications', ProPresenterVerificationModel, verificationData)
  load('requests.view', 'deviceRequests', ProPresenterDeviceRequestModel, serializeDeviceRequest)
  load('requests.view', 'propresenterRequests', ProPresenterWaitlistModel, plain)
  load('requests.view', 'yandexRequests', Yandex360RequestModel, plain)
  if (c.access!.permissions.includes('teams.view')) tasks.push(list(TeamModel, new URLSearchParams('limit=100')).then(async result => { const teams = await TeamModel.find({ _id: { $in: result.data.map((x: any) => x.id) } }).sort({ updatedAt: -1, _id: -1 }); snapshot.teams = { ...result, data: await teamData(teams, uid(c), true, c.access!.permissions.includes('subscriptions.view')) } }))
  if (c.access!.permissions.includes('streams.view')) tasks.push(admin.adminGetAllStreams().then(streams => { snapshot.streams = streams.map(serializeStream) }))
  await Promise.all(tasks)
  // Sorted keys make the hash independent of completion order of concurrent queries.
  const stable = Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)))
  const revision = createHash('sha256').update(JSON.stringify(stable)).digest('hex')
  return { data: { revision, changed: c.query.get('since') !== revision, pollAfterMs: 5000, snapshot: c.query.get('since') === revision ? null : stable } }
}, 'admin')


add('GET', '/api/admin/notifications', 'Payment notification delivery status', c => list(ApiNotificationModel, c.query, {}, n => ({ id: n.id, paymentId: n.paymentId, decision: n.decision, status: n.status, attempts: n.attempts, nextAttemptAt: n.nextAttemptAt, lastError: n.lastError, sentAt: n.sentAt })), 'payments.view')
add('GET', '/api/admin/subscriptions', 'Subscriptions without requiring user-profile permission', async c => {
  const { page, limit, skip } = pagination(c.query)
  const [items, total] = await Promise.all([TeamModel.find().sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit), TeamModel.countDocuments()])
  return { data: items.map(t => ({ teamId: t.id, teamName: t.name, subscriptions: [...t.subscriptions.entries()].map(([productId, sub]) => ({ productId, status: sub.status, expiresAt: sub.expiresAt || null, flowNumber: Number(sub.meta?.flowNumber) || null })) })), meta: { page, limit, total } }
}, 'subscriptions.view')
add('GET', '/api/teams/:teamId/subscriptions/:productId/credentials', 'Explicit access credentials for an entitled member', async c => {
  const team = await memberTeam(c); product(c.params.productId)
  const sub = team.subscriptions.get(c.params.productId)
  if (!sub || sub.status !== 'active' || !sub.expiresAt || sub.expiresAt <= new Date()) throw new ApiError(403, 'ENTITLEMENT_REQUIRED', 'Active subscription is required')
  return { data: { email: sub.meta?.email || null, password: sub.meta?.password || null, chatLink: sub.meta?.chatLink || null, flowNumber: Number(sub.meta?.flowNumber) || null } }
})
add('GET', '/api/admin/streams/:flow/credentials', 'Explicit stream credentials for stream editors', async c => {
  const stream = found(await admin.adminGetStream(flow(c)))
  return { data: { email: stream.email, password: stream.password, chatLink: stream.chatLink } }
}, 'streams.edit')


add('POST', '/api/admin/streams/:flow/chat', 'Bind renewal group chat', async c => ({ data: serializeStream(await domain(() => renewal.bindStreamChat(flow(c), c.body.chatId))) }), 'streams.edit', body({ chatId: { type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: -1 } }))
add('GET', '/api/admin/streams/:flow/teams', 'Teams in a ProPresenter stream', async c => ({ data: (await admin.adminGetTeamsInStream(flow(c))).map(team => ({ id: team.id, name: team.name, ownerId: team.ownerId })) }), 'streams.view')
add('POST', '/api/admin/teams/:teamId/remove-from-stream', 'Remove team from ProPresenter stream', async c => { await domain(() => admin.adminRemoveTeamFromStream(tid(c), uid(c))); return { data: { removed: true } } }, 'streams.edit', body({}))
add('POST', '/api/admin/propresenter-batches/:flow/title', 'Rename ProPresenter request batch', async c => ({ data: await domain(() => waitlist.renameRequestBatch(flow(c), c.body.title, uid(c))) }), 'requests.edit', body({ title: string(100) }))
add('GET', '/api/admin/audit', 'Superadmin audit log without arbitrary metadata', async c => {
  if (c.access!.role !== 'superadmin') throw new ApiError(403, 'SUPERADMIN_REQUIRED', 'Superadmin role required')
  return list(AuditLogModel, c.query, {}, event => ({ id: event.id, type: event.type, actorType: event.actorType, actorTelegramId: event.actorTelegramId, targetUserId: event.targetUserId, targetTeamId: event.targetTeamId, targetPaymentId: event.targetPaymentId, createdAt: event.createdAt }), { createdAt: -1, _id: -1 })
}, 'admin')

add('GET', '/api/payment-options', 'Live payment requisites from the same configuration as Telegram', async () => ({ data: process.env.HUB_API_DEMO === 'true' ? getPaymentOptions().map(option => ({ ...option, details: 'DEMO ONLY — no real payment', recipient: 'Демо', configured: true })) : getPaymentOptions() }))

add('GET', '/api/registration', 'My registration draft', async c => ({ data: serializeUser(c.user) }))
add('PATCH', '/api/registration', 'Save registration draft', async c => {
  const updates = Object.fromEntries(Object.entries(c.body).map(([key, value]) => [key, String(value).trim()]))
  const user = await UserModel.findOneAndUpdate({ telegramId: uid(c), reg: { $ne: 'done' } }, { $set: { ...updates, username: c.session.user.username || c.user.username || null, reg: 'in_progress', regStep: 'confirm_registration' } }, { new: true, runValidators: true })
  if (!user) throw new ApiError(409, 'ALREADY_REGISTERED', 'Use the profile endpoint to edit registered users')
  return { data: serializeUser(user) }
}, undefined, body({ fio: { ...string(200), minLength: 3 }, city: string(200), church: string(200) }, []))
add('POST', '/api/registration/confirm', 'Confirm profile through the same service as Telegram', async c => {
  if (c.body.confirmed !== true) throw new ApiError(422, 'CONFIRMATION_REQUIRED', 'Confirm profile data')
  const result = await domain(() => confirmUserRegistration(uid(c)))
  const delivery = result.applied ? await notify(() => notifyRegisteredUser(c.telegram, uid(c), c.session.user.username)) : { status: 'not_required' }
  return { data: serializeUser(result.user), applied: result.applied, delivery }
}, undefined, body({ confirmed: { type: 'boolean' } }))

const verificationData = (request: any) => ({ id: request.id, teamId: request.teamId, requestedBy: request.requestedBy, flowNumber: request.flowNumber, status: request.status, decidedBy: request.decidedBy, decidedAt: request.decidedAt, createdAt: request.createdAt, updatedAt: request.updatedAt })
add('GET', '/api/teams/:teamId/stream-verifications', 'Existing ProPresenter flow confirmation requests', async c => { await memberTeam(c); return list(ProPresenterVerificationModel, c.query, { teamId: tid(c) }, verificationData) })
add('POST', '/api/teams/:teamId/stream-verifications', 'Owner requests confirmation of an existing flow', async c => {
  const team = await memberTeam(c, true)
  const request = found(await domain(() => createStreamVerification(team.id, uid(c), c.body.flowNumber)))
  const delivery = await notify(async () => {
    const sent = await c.telegram.sendMessage(ADMIN_GROUP_ID, `🌐 Проверка потока №${request.flowNumber} · команда ${team.name}`, { message_thread_id: PROP_STREAM_VERIFY_THREAD_ID, reply_markup: new InlineKeyboard().text('✅ Подтвердить', packCb({ a: 'prop_verify_accept', p: `${team.id}:${request.flowNumber}` })).text('❌ Отклонить', packCb({ a: 'prop_verify_reject', p: team.id })) })
    request.adminMessageId = sent.message_id; await request.save()
  })
  return { data: verificationData(request), delivery, status: 201 }
}, undefined, body({ flowNumber: integer }))
add('GET', '/api/admin/stream-verifications', 'Persistent flow confirmation queue from Telegram and web', c => list(ProPresenterVerificationModel, c.query, {}, verificationData), 'requests.view')
for (const action of ['approve', 'reject']) add('POST', `/api/admin/stream-verifications/:id/${action}`, `Flow confirmation ${action}`, async c => {
  const result = await domain(() => decideStreamVerification(pid(c), uid(c), action === 'approve'))
  const request = found(result.request)
  const delivery = result.applied ? await notify(() => c.telegram.sendMessage(request.requestedBy, `Поток №${request.flowNumber}: ${action === 'approve' ? 'подтверждён. Доступ появился в команде.' : 'не подтверждён. Свяжитесь с поддержкой.'}`)) : { status: 'not_required' }
  if (request.adminMessageId) await notify(() => c.telegram.editMessageReplyMarkup(ADMIN_GROUP_ID, request.adminMessageId!, { reply_markup: new InlineKeyboard().text(request.status, packCb({ a: 'noop' })) }))
  return { data: verificationData(request), applied: result.applied, delivery }
}, 'requests.edit', body({}))

add('POST', '/api/admin/uploads', 'Upload verified media for tutorials or broadcasts', async c => {
  const permission = c.body.purpose === 'tutorial' ? 'tutorials.edit' : 'broadcasts.send'
  if (!c.access?.permissions.includes(permission)) throw new ApiError(403, 'PERMISSION_REQUIRED', 'Missing permission for media purpose')
  const file = await uploadFile(c.telegram, ADMIN_GROUP_ID, c.body)
  const record = await ApiMediaModel.create({ ...file, actorId: uid(c), purpose: c.body.purpose })
  return { data: { id: record.id, type: record.type, fileName: record.fileName, mimeType: record.mimeType, purpose: record.purpose }, status: 201 }
}, 'admin', { ...uploadSchema, properties: { ...uploadSchema.properties, purpose: choice(['tutorial', 'broadcast']) }, required: [...uploadSchema.required!, 'purpose'] }, 14_100_000)
add('POST', '/api/admin/tutorials/lessons/:id/media', 'Attach uploaded photo or video to a lesson', async c => {
  const media = found(await ApiMediaModel.findOne({ _id: c.body.uploadId, purpose: 'tutorial', actorId: uid(c) }))
  if (media.type === 'document') throw new ApiError(422, 'INVALID_MEDIA', 'Tutorial lessons support photo and video')
  const lesson = found(await TutorialLessonModel.findByIdAndUpdate(pid(c), { $set: { mediaType: media.type, mediaFileId: media.telegramFileId } }, { new: true, runValidators: true }))
  return { data: serializeLesson(lesson) }
}, 'tutorials.edit', body({ uploadId: id }))
add('GET', '/api/admin/tutorials/lessons/:id/media', 'Download draft or published lesson media', async c => {
  return download(c, found(found(await tutorials.getLesson(pid(c))).mediaFileId))
}, 'tutorials.view')
for (const adminMode of [false, true]) add('POST', `${adminMode ? '/api/admin/support' : '/api/support/conversations'}/:id/attachments`, 'Send photo, document or video with optional caption', async c => {
  const ticket = found(await SupportTicketModel.findOne({ _id: pid(c), ...(adminMode ? {} : { userId: uid(c) }) }))
  if (ticket.status !== 'open') throw new ApiError(409, 'CONVERSATION_CLOSED', 'Conversation is closed')
  const file = await uploadFile(c.telegram, adminMode ? ticket.userId : SUPPORT_GROUP_ID, c.body, adminMode ? undefined : ticket.threadId)
  const message = await support.saveSupportMessage({ ticketId: ticket.id, senderType: adminMode ? 'admin' : 'user', senderId: uid(c), source: 'web', text: c.body.text?.trim() || null, telegramDestinationMessageId: file.messageId, attachments: [{ type: file.type === 'photo' ? 'image' : file.type, telegramFileId: file.telegramFileId, fileName: file.fileName, mimeType: file.mimeType }] })
  const delivery = adminMode ? await notify(() => c.telegram.copyMessage(SUPPORT_GROUP_ID, ticket.userId, file.messageId, { message_thread_id: ticket.threadId })) : { status: 'sent' }
  return { data: serializeSupportMessage(message), delivery, status: 201 }
}, adminMode ? 'support.reply' : undefined, uploadSchema, 14_100_000)

add('GET', '/api/admin/broadcasts', 'Broadcast drafts and delivery history from both surfaces', c => list(BroadcastModel, c.query, {}, broadcastData), 'broadcasts.send')
add('POST', '/api/admin/broadcasts', 'Create previewable draft and freeze recipient list', async c => ({ data: broadcastData(await domain(() => createBroadcastDraft({ actorId: uid(c), ...c.body }))), status: 201 }), 'broadcasts.send', body({ audience: choice(['all', 'stream']), flowNumber: integer, text: { ...string(4000), minLength: 0 }, mediaId: id }, ['audience']))
add('GET', '/api/admin/broadcasts/:id', 'Broadcast preview and progress', async c => ({ data: broadcastData(found(await BroadcastModel.findById(pid(c)))) }), 'broadcasts.send')
add('PATCH', '/api/admin/broadcasts/:id', 'Edit draft text', async c => {
  const existing = found(await BroadcastModel.findById(pid(c)))
  if (existing.mediaId && c.body.text.length > 1000) throw new ApiError(422, 'INVALID_TEXT', 'Media caption is limited to 1000 characters')
  const draft = found(await BroadcastModel.findOneAndUpdate({ _id: pid(c), source: 'api', status: 'draft' }, { $set: { text: c.body.text.trim() } }, { new: true }))
  return { data: broadcastData(draft) }
}, 'broadcasts.send', body({ text: string(4000) }))
add('POST', '/api/admin/broadcasts/:id/send', 'Explicitly confirm the reviewed draft for background delivery', async c => {
  if (c.body.confirmed !== true) throw new ApiError(422, 'CONFIRMATION_REQUIRED', 'Confirm the reviewed draft')
  const job = await BroadcastModel.findOneAndUpdate({ _id: pid(c), source: 'api', status: 'draft' }, { $set: { status: 'running', leaseUntil: new Date() } }, { new: true })
  return { data: broadcastData(job || found(await BroadcastModel.findById(pid(c)))), applied: Boolean(job) }
}, 'broadcasts.send', body({ confirmed: { type: 'boolean' } }))
add('POST', '/api/admin/broadcasts/:id/cancel', 'Cancel pending broadcast deliveries', async c => {
  const job = await BroadcastModel.findOneAndUpdate({ _id: pid(c), source: 'api', status: { $in: ['draft', 'running'] } }, { $set: { status: 'cancelled' } }, { new: true })
  return { data: broadcastData(job || found(await BroadcastModel.findById(pid(c)))), applied: Boolean(job) }
}, 'broadcasts.send', body({}))
add('GET', '/api/admin/broadcasts/:id/media', 'Download the draft media', async c => {
  const job = found(await BroadcastModel.findById(pid(c)))
  const media = found(await ApiMediaModel.findById(found(job.mediaId)))
  return download(c, media.telegramFileId)
}, 'broadcasts.send')
add('GET', '/api/admin/broadcasts/:id/telegram-media/:messageIndex/:attachmentIndex', 'Download recorded Telegram broadcast attachment', async c => {
  const job = found(await BroadcastModel.findById(pid(c)))
  if (!/^\d+$/.test(c.params.messageIndex) || !/^\d+$/.test(c.params.attachmentIndex)) throw new ApiError(422, 'INVALID_INDEX', 'Invalid attachment index')
  return download(c, found(job.telegramPreviews[Number(c.params.messageIndex)]?.attachments?.[Number(c.params.attachmentIndex)]?.telegramFileId))
}, 'broadcasts.send')

// Detail endpoints keep mobile deep links independent of a cached list page.
for (const [path, model, permission, serializer] of [
  ['/api/admin/devices/:id', ProPresenterDeviceModel, 'streams.view', serializeDevice],
  ['/api/admin/device-requests/:id', ProPresenterDeviceRequestModel, 'requests.view', serializeDeviceRequest],
  ['/api/admin/stream-verifications/:id', ProPresenterVerificationModel, 'requests.view', verificationData],
  ['/api/admin/propresenter-requests/:id', ProPresenterWaitlistModel, 'requests.view', plain],
  ['/api/admin/renewals/:id', ProPresenterRenewalCampaignModel, 'streams.view', plain],
  ['/api/admin/yandex360/streams/:id', Yandex360StreamModel, 'streams.view', plain],
  ['/api/admin/yandex360/members/:id', Yandex360MemberModel, 'streams.view', plain],
  ['/api/admin/yandex360/requests/:id', Yandex360RequestModel, 'requests.view', plain],
  ['/api/admin/tutorials/topics/:id', TutorialTopicModel, 'tutorials.view', plain],
  ['/api/admin/tutorials/lessons/:id', TutorialLessonModel, 'tutorials.view', serializeLesson],
] as const) add('GET', path, 'Administrative detail for mobile deep links', async c => ({ data: serializer(found(await (model as any).findById(pid(c)))) }), permission)
add('GET', '/api/admin/subscriptions/:teamId/:productId', 'Subscription detail without private credentials', async c => {
  const team = found(await TeamModel.findById(tid(c))); product(c.params.productId)
  return { data: { teamId: team.id, teamName: team.name, ...serializeSubscription(c.params.productId, team.subscriptions.get(c.params.productId)) } }
}, 'subscriptions.view')

add('GET', '/api/admin/renewals/:id/seats', 'Renewal decisions and device payment statuses', async c => { found(await ProPresenterRenewalCampaignModel.findById(pid(c))); return { data: (await ProPresenterRenewalSeatModel.find({ campaignId: pid(c) })).map(plain) } }, 'streams.view')
add('POST', '/api/renewals/:id/teams/:teamId/vote', 'Vote for a legacy team renewal', async c => ({ data: await domain(() => renewal.voteForSeat(c.telegram, pid(c), tid(c), uid(c), c.body.vote)) }), undefined, body({ vote: choice(['yes','no']) }))
add('GET', '/api/help', 'Shared information from the Telegram screens', async () => ({ data: { legal: legalScreen(0).caption, team: teamAboutScreen().caption, other: otherScreen(0).caption, payment: aboutPaymentScreen(0).caption } }))
export const apiRoutes = routes
