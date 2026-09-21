import http from 'node:http'
import { Api } from 'grammy'
import { PRODUCTS } from '../config/products.js'
import { SUPPORT_GROUP_ID } from '../config/env.js'
import { UserModel } from '../models/User.js'
import { getTeamById, getUserTeams } from '../services/team.service.js'
import { acceptPayment, getPayment, listPayments, rejectPayment } from '../services/payment.service.js'
import { createSupportTicketForUser, getSupportTicketWithMessages, listAllSupportTickets, listSupportTicketsForUser, saveSupportMessage } from '../services/support.service.js'
import {
  readTelegramInitData,
  TelegramWebAppAuthError,
  verifyTelegramWebAppInitData,
} from './auth/telegramWebAppAuth.js'
import { requireAdminUser } from './auth/admin.js'
import { isTeamMember } from './auth/teamAccess.js'
import { methodNotAllowed, readJson, routePath, sendJson } from './http.js'
import { serializePayment, serializeSupportMessage, serializeSupportTicket, serializeTeam, serializeUser } from './serializers.js'
import { deliverAcceptedPayment, deliverRejectedPayment } from '../adapters/telegram/paymentDelivery.js'

export type ApiServerOptions = {
  botToken: string
  port: number
  host?: string
  maxAuthAgeSeconds?: number
  allowDevAuth?: boolean
}

export function createApiServer(options: ApiServerOptions) {
  const telegram = new Api(options.botToken)
  return http.createServer(async (request, response) => {
    const startedAt = Date.now()
    const authScheme = request.headers.authorization?.split(/\s+/, 1)[0]?.toLowerCase() || 'none'
    response.once('finish', () => {
      console.info(`[API] ${request.method || 'UNKNOWN'} ${request.url || '/'} -> ${response.statusCode} ${Date.now() - startedAt}ms auth=${authScheme}`)
    })
    try {
      const path = routePath(request)
      if (path === '/health') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET'])
        return sendJson(response, 200, { status: 'ok' })
      }

      const devMatch = options.allowDevAuth && process.env.NODE_ENV !== 'production'
        ? request.headers.authorization?.match(/^dev\s+(\d+)$/i)
        : null
      const session = devMatch
        ? { user: { id: Number(devMatch[1]), first_name: 'Developer' }, authDate: new Date() }
        : verifyTelegramWebAppInitData(readTelegramInitData(request.headers.authorization), options.botToken, { maxAgeSeconds: options.maxAuthAgeSeconds })
      const user = await UserModel.findOne({ telegramId: session.user.id })
      if (!user) {
        console.warn(`[API auth] Verified Telegram user ${session.user.id} is absent from HUB User collection`)
        return sendJson(response, 403, {
          error: { code: 'HUB_USER_NOT_FOUND', message: 'Complete registration in the bot first' },
        })
      }

      const adminRequired = () => {
        try { return requireAdminUser(session.user.id) }
        catch { sendJson(response, 403, { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required' } }); return false }
      }

      const supportMatch = path.match(/^\/api\/support\/conversations\/([a-f\d]{24})$/i)
      const supportMessagesMatch = path.match(/^\/api\/support\/conversations\/([a-f\d]{24})\/messages$/i)
      const adminPaymentMatch = path.match(/^\/api\/admin\/payments\/([a-f\d]{24})$/i)
      const adminDecisionMatch = path.match(/^\/api\/admin\/payments\/([a-f\d]{24})\/(accept|reject)$/i)
      const adminSupportMatch = path.match(/^\/api\/admin\/support\/([a-f\d]{24})$/i)
      const adminSupportMessagesMatch = path.match(/^\/api\/admin\/support\/([a-f\d]{24})\/messages$/i)
      const teamMatch = path.match(/^\/api\/teams\/([a-f\d]{24})$/i)

      if (path === '/api/support/conversations' && request.method === 'GET') {
        const tickets = await listSupportTicketsForUser(session.user.id)
        return sendJson(response, 200, { data: tickets.map(serializeSupportTicket) })
      }
      if (path === '/api/support/conversations' && request.method === 'POST') {
        const ticket = await createSupportTicketForUser(telegram, session.user.id, { username: session.user.username })
        return sendJson(response, 200, { data: serializeSupportTicket(ticket) })
      }
      if (supportMatch && request.method === 'GET') {
        const result = await getSupportTicketWithMessages(supportMatch[1], session.user.id)
        if (!result) return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Conversation not found' } })
        return sendJson(response, 200, { data: { ...serializeSupportTicket(result.ticket), messages: result.messages.map(serializeSupportMessage) } })
      }
      if (supportMessagesMatch && request.method === 'POST') {
        const result = await getSupportTicketWithMessages(supportMessagesMatch[1], session.user.id)
        if (!result || result.ticket.status !== 'open') return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Open conversation not found' } })
        const body = await readJson(request)
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text || text.length > 4000) return sendJson(response, 422, { error: { code: 'INVALID_TEXT', message: 'Message must contain 1-4000 characters' } })
        const delivered = await telegram.sendMessage(SUPPORT_GROUP_ID, text, { message_thread_id: result.ticket.threadId })
        const message = await saveSupportMessage({ ticketId: result.ticket.id, senderType: 'user', senderId: session.user.id, text, source: 'web', telegramDestinationMessageId: delivered.message_id })
        return sendJson(response, 201, { data: serializeSupportMessage(message) })
      }

      if (path === '/api/admin/payments' && request.method === 'GET') {
        if (!adminRequired()) return
        const payments = await listPayments()
        return sendJson(response, 200, { data: payments.map(serializePayment) })
      }
      if (adminPaymentMatch && request.method === 'GET') {
        if (!adminRequired()) return
        const payment = await getPayment(adminPaymentMatch[1])
        if (!payment) return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Payment not found' } })
        return sendJson(response, 200, { data: serializePayment(payment) })
      }
      if (adminDecisionMatch && request.method === 'POST') {
        if (!adminRequired()) return
        const accepting = adminDecisionMatch[2] === 'accept'
        const result = accepting
          ? await acceptPayment(adminDecisionMatch[1], session.user.id)
          : await rejectPayment(adminDecisionMatch[1], session.user.id)
        if (accepting) await deliverAcceptedPayment(telegram, result)
        else await deliverRejectedPayment(telegram, result)
        return sendJson(response, 200, { data: serializePayment(result.payment), applied: result.applied })
      }
      if (path === '/api/admin/support' && request.method === 'GET') {
        if (!adminRequired()) return
        const tickets = await listAllSupportTickets()
        return sendJson(response, 200, { data: tickets.map(serializeSupportTicket) })
      }
      if (adminSupportMatch && request.method === 'GET') {
        if (!adminRequired()) return
        const result = await getSupportTicketWithMessages(adminSupportMatch[1])
        if (!result) return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Conversation not found' } })
        return sendJson(response, 200, { data: { ...serializeSupportTicket(result.ticket), messages: result.messages.map(serializeSupportMessage) } })
      }
      if (adminSupportMessagesMatch && request.method === 'POST') {
        if (!adminRequired()) return
        const result = await getSupportTicketWithMessages(adminSupportMessagesMatch[1])
        if (!result || result.ticket.status !== 'open') return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Open conversation not found' } })
        const body = await readJson(request)
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text || text.length > 4000) return sendJson(response, 422, { error: { code: 'INVALID_TEXT', message: 'Message must contain 1-4000 characters' } })
        await telegram.sendMessage(SUPPORT_GROUP_ID, `🌐 ${text}`, { message_thread_id: result.ticket.threadId })
        const delivered = await telegram.sendMessage(result.ticket.userId, text)
        const message = await saveSupportMessage({ ticketId: result.ticket.id, senderType: 'admin', senderId: session.user.id, text, source: 'web', telegramDestinationMessageId: delivered.message_id })
        return sendJson(response, 201, { data: serializeSupportMessage(message) })
      }

      if (request.method !== 'GET') return methodNotAllowed(response, ['GET'])

      if (path === '/api/me') {
        return sendJson(response, 200, { data: { ...serializeUser(user), avatarUrl: session.user.photo_url || null } })
      }
      if (path === '/api/teams') {
        const teams = await getUserTeams(session.user.id)
        const memberIds = [...new Set(teams.flatMap((team) => team.members.map((member: any) => member.telegramId)))]
        const users = await UserModel.find({ telegramId: { $in: memberIds } }).select('telegramId username fio city church').lean()
        const profiles = new Map(users.map((profile) => [profile.telegramId, profile]))
        return sendJson(response, 200, {
          data: teams.map((team) => serializeTeam(team, session.user.id, profiles)),
        })
      }
      if (teamMatch) {
        const team = await getTeamById(teamMatch[1])
        if (!team || !isTeamMember(team, session.user.id)) {
          return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Team not found' } })
        }
        const memberIds = team.members.map((member: any) => member.telegramId)
        const users = await UserModel.find({ telegramId: { $in: memberIds } }).select('telegramId username fio city church').lean()
        const profiles = new Map(users.map((profile) => [profile.telegramId, profile]))
        return sendJson(response, 200, { data: serializeTeam(team, session.user.id, profiles) })
      }
      if (path === '/api/products') {
        const teams = await getUserTeams(session.user.id)
        const statuses = new Map<string, any>()
        for (const team of teams) {
          for (const [productId, subscription] of team.subscriptions.entries()) {
            if (subscription.status === 'active') statuses.set(productId, subscription)
          }
        }
        return sendJson(response, 200, {
          data: Object.values(PRODUCTS)
            .filter((product) => product.id !== 'add_member')
            .map((product) => ({
              id: product.id,
              name: product.name,
              description: product.description,
              cover: product.cover,
              priceRub: product.priceRub,
              priceUsd: product.priceUsd,
              cartable: product.cartable,
              active: statuses.has(product.id),
            })),
        })
      }
      if (path === '/api/admin/session') {
        if (!adminRequired()) return
        return sendJson(response, 200, { data: { user: serializeUser(user), isAdmin: true } })
      }

      return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
    } catch (error) {
      if (error instanceof TelegramWebAppAuthError) {
        console.warn(`[API auth] ${request.method || 'UNKNOWN'} ${request.url || '/'}: ${error.message}`)
        return sendJson(response, 401, { error: { code: 'UNAUTHORIZED', message: error.message } })
      }
      console.error('API request failed:', error)
      return sendJson(response, 500, {
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      })
    }
  })
}

export function startApiServer(options: ApiServerOptions) {
  const server = createApiServer(options)
  server.listen(options.port, options.host || '0.0.0.0', () => {
    console.log(`HUB API listening on ${options.host || '0.0.0.0'}:${options.port}`)
  })
  return server
}
