import type { IncomingMessage, ServerResponse } from 'node:http'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'no-referrer' })
  response.end(JSON.stringify(body))
}
export function routePath(request: IncomingMessage): string {
  return new URL(request.url || '/', 'http://localhost').pathname.replace(/\/$/, '') || '/'
}
export function methodNotAllowed(response: ServerResponse, allowed: string[]) {
  response.setHeader('allow', allowed.join(', '))
  sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
}
export async function readJson(request: IncomingMessage, maxBytes = 32_768): Promise<any> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json')
  if (Number(request.headers['content-length']) > maxBytes) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk); size += buffer.length
    if (size > maxBytes) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body is too large')
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch { throw new ApiError(400, 'INVALID_JSON', 'Expected a valid JSON object') }
}
export function objectId(value: string): string {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new ApiError(422, 'INVALID_ID', 'Invalid resource ID')
  return value
}
export function positiveInteger(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new ApiError(422, 'INVALID_ID', 'Invalid numeric ID')
  return Number(value)
}
export function pagination(query: URLSearchParams) {
  const page = query.get('page') ?? '0'; const limit = query.get('limit') ?? '50'
  if (!/^\d+$/.test(page) || Number(page) > 10000 || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) throw new ApiError(422, 'INVALID_PAGE', 'Use page >= 0 and limit 1-100')
  return { page: Number(page), limit: Number(limit), skip: Number(page) * Number(limit) }
}
export function found<T>(value: T): NonNullable<T> {
  if (!value) throw new ApiError(404, 'NOT_FOUND', 'Resource not found')
  return value as NonNullable<T>
}
