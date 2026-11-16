import http from 'node:http'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { Api, GrammyError, HttpError } from 'grammy'
import { getOrCreateUser } from '../services/user.service.js'
import { UserModel } from '../models/User.js'
import { getAdminAccess, AdminPermissionError } from '../services/adminAccess.service.js'
import { PaymentNotFoundError } from '../services/payment.service.js'
import { TeamNameValidationError, TeamOwnerNotFoundError } from '../services/team.service.js'
import { readTelegramInitData, TelegramWebAppAuthError, verifyTelegramWebAppInitData } from './auth/telegramWebAppAuth.js'
import { ApiError, readJson, routePath, sendJson, methodNotAllowed } from './http.js'
import { auditLogService } from '../services/auditLog.service.js'
import { startBroadcastWorker } from '../services/broadcast.service.js'
import { startNotificationWorker } from './notifications.js'
import { apiRoutes } from './routes.js'
import { matchRoute, openApi, validateBody } from './contract.js'

export type ApiServerOptions = { botToken: string; port: number; host?: string; maxAuthAgeSeconds?: number; allowDevAuth?: boolean; allowedOrigins?: string[]; telegram?: Api; rateLimitPerMinute?: number }
export function createApiServer(options: ApiServerOptions) {
  if (options.allowDevAuth && process.env.NODE_ENV !== 'production' && !['127.0.0.1', '::1', 'localhost'].includes(options.host || '127.0.0.1')) throw new Error('Development auth requires a loopback API_HOST')
  const telegram = options.telegram || new Api(options.botToken)
  const buckets = new Map<number, { start: number; count: number }>()
  return http.createServer({ requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 16_384 }, async (request, response) => {
    const requestId = randomUUID(); const started = Date.now()
    response.setHeader('x-request-id', requestId)
    response.once('finish', () => console.info(`[API] ${requestId} ${request.method} ${routePath(request)} ${response.statusCode} ${Date.now() - started}ms`))
    try {
      const path = routePath(request)
      const origin = request.headers.origin
      if (origin && options.allowedOrigins?.includes(origin)) {
        response.setHeader('access-control-allow-origin', origin)
        response.setHeader('vary', 'Origin')
        response.setHeader('access-control-allow-headers', 'Authorization, Content-Type')
        response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        response.setHeader('access-control-expose-headers', 'X-Request-Id')
      } else if (origin && options.allowedOrigins?.length) throw new ApiError(403, 'ORIGIN_DENIED', 'Origin is not allowed')
      if (request.method === 'OPTIONS') {
        if (!origin || !options.allowedOrigins?.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED', 'Origin is not allowed')
        response.writeHead(204); response.end(); return
      }
      if (path === '/health' || path === '/ready') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET'])
        const ready = mongoose.connection.readyState === 1
        return sendJson(response, path === '/ready' && !ready ? 503 : 200, { status: path === '/health' ? 'ok' : ready ? 'ready' : 'unavailable' })
      }
      if (path === '/api/openapi.json') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET'])
        return sendJson(response, 200, openApi(apiRoutes))
      }
      const matches = apiRoutes.map(route => ({ route, params: matchRoute(route, path) })).filter(item => item.params)
      if (!matches.length) throw new ApiError(404, 'NOT_FOUND', 'Route not found')
      const matched = matches.find(item => item.route.method === request.method)
      if (!matched) return methodNotAllowed(response, [...new Set(matches.map(item => item.route.method))])
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '')
      const devMatch = options.allowDevAuth && process.env.NODE_ENV !== 'production' && loopback ? request.headers.authorization?.match(/^dev\s+([1-9]\d*)$/i) : null
      const session = devMatch ? { user: { id: Number(devMatch[1]), first_name: 'Developer' }, authDate: new Date() } : verifyTelegramWebAppInitData(readTelegramInitData(request.headers.authorization), options.botToken, { maxAgeSeconds: options.maxAuthAgeSeconds })
      if (!Number.isSafeInteger(session.user.id)) throw new TelegramWebAppAuthError('Invalid user ID')
      const now = Date.now()
      for (const [key, bucket] of buckets) if (now - bucket.start >= 60_000) buckets.delete(key)
      const bucket = buckets.get(session.user.id) || { start: now, count: 0 }
      buckets.set(session.user.id, bucket); bucket.count++
      if (bucket.count > (options.rateLimitPerMinute ?? 120)) { response.setHeader('retry-after', Math.ceil((60_000 - now + bucket.start) / 1000)); throw new ApiError(429, 'RATE_LIMITED', 'Too many requests') }
      const registrationRoute = path === '/api/registration' || path === '/api/registration/confirm'
      const user = registrationRoute ? await getOrCreateUser(session.user.id) : await UserModel.findOne({ telegramId: session.user.id })
      if (!user) throw new ApiError(403, 'HUB_USER_NOT_FOUND', 'Complete registration in the bot first')
      if (!registrationRoute && path !== '/api/me' && user.reg !== 'done') throw new ApiError(403, 'REGISTRATION_REQUIRED', 'Complete registration first')
      const access = await getAdminAccess(session.user.id)
      const { route, params } = matched
      if (route.permission && (!access || (route.permission !== 'admin' && !access.permissions.includes(route.permission)))) throw new ApiError(403, 'PERMISSION_REQUIRED', 'Administrator permission required')
      const body = route.body ? await readJson(request, route.maxBytes) : {}
      if (route.body) validateBody(body, route.body)
      const result = await route.handle({ user, session, access, telegram, params: params!, body, query: new URL(request.url || '/', 'http://localhost').searchParams })
      if (result.binary) {
        response.writeHead(200, { 'content-type': result.binary.contentType, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }); response.end(result.binary.buffer); return
      }
      const { status, ...envelope } = result
      sendJson(response, status || 200, envelope)
    } catch (error: any) {
      if (response.writableEnded || response.destroyed) return
      let failure: ApiError
      if (error instanceof ApiError) failure = error
      else if (error instanceof TelegramWebAppAuthError) failure = new ApiError(401, 'UNAUTHORIZED', error.message)
      else if (error instanceof AdminPermissionError) failure = new ApiError(403, 'PERMISSION_REQUIRED', 'Administrator permission required')
      else if (error instanceof PaymentNotFoundError || error instanceof TeamOwnerNotFoundError) failure = new ApiError(404, 'NOT_FOUND', 'Resource not found')
      else if (error instanceof TeamNameValidationError || error?.name === 'ValidationError' || error?.name === 'CastError') failure = new ApiError(422, 'VALIDATION_ERROR', 'Invalid input')
      else if (error?.code === 11000) failure = new ApiError(409, 'DUPLICATE_RESOURCE', 'Resource already exists')
      else if (error instanceof GrammyError || error instanceof HttpError) failure = new ApiError(502, 'TELEGRAM_UNAVAILABLE', 'Telegram delivery is unavailable')
      else { failure = new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'); console.error(`[API] ${requestId} failed: ${error?.name || 'UnknownError'}`) }
      sendJson(response, failure.status, { error: { code: failure.code, message: failure.message, requestId } })
    }
  })
}
export function startApiServer(options: ApiServerOptions) {
  const server = createApiServer(options)
  const telegram = options.telegram || new Api(options.botToken)
  auditLogService.setTelegramApi(telegram)
  const stopWorker = startNotificationWorker(telegram)
  const stopBroadcasts = startBroadcastWorker(telegram)
  server.once('close', () => { stopWorker(); stopBroadcasts() })
  const host = options.host || '127.0.0.1'
  server.listen(options.port, host, () => console.log(`HUB API listening on ${host}:${options.port}`))
  return server
}
