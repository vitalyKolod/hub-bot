import type { Api } from 'grammy'
import type { AdminPermission, ResolvedAdminAccess } from '../services/adminAccess.service.js'
import type { TelegramWebAppSession } from './auth/telegramWebAppAuth.js'
import { ApiError } from './http.js'

export type Field = { type: 'string' | 'integer' | 'boolean' | 'array'; enum?: readonly (string | number)[]; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; pattern?: string; items?: Field; maxItems?: number }
export const string = (maxLength = 200): Field => ({ type: 'string', minLength: 1, maxLength })
export const id: Field = { ...string(24), pattern: '^[a-fA-F0-9]{24}$' }
export const integer: Field = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
export const choice = (values: readonly string[]): Field => ({ type: 'string', enum: values })
export type BodySchema = { properties: Record<string, Field>; required?: string[] }
export type ApiContext = { session: TelegramWebAppSession; user: any; access: ResolvedAdminAccess | null; telegram: Api; params: Record<string, string>; query: URLSearchParams; body: any }
export type ApiResult = { data: unknown; meta?: unknown; applied?: boolean; delivery?: unknown; status?: number; binary?: { buffer: Buffer; contentType: string } }
export type Route = { method: string; path: string; summary: string; permission?: AdminPermission | 'admin'; body?: BodySchema; maxBytes?: number; handle: (context: ApiContext) => Promise<ApiResult> }

export function validateBody(value: unknown, schema: BodySchema): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_BODY', 'Expected a JSON object')
  const body = value as Record<string, unknown>
  for (const key of schema.required || []) if (!(key in body)) throw new ApiError(422, 'VALIDATION_ERROR', `${key} is required`)
  for (const [key, entry] of Object.entries(body)) {
    const rule = schema.properties[key]
    if (!rule || !validField(entry, rule)) throw new ApiError(422, 'VALIDATION_ERROR', `${key} is invalid`)
  }
}
function validField(value: any, rule: Field): boolean {
  if (rule.type === 'integer') return Number.isSafeInteger(value) && value >= (rule.minimum ?? 0) && value <= (rule.maximum ?? Number.MAX_SAFE_INTEGER) && (!rule.enum || rule.enum.includes(value))
  if (rule.type === 'boolean') return typeof value === 'boolean'
  if (rule.type === 'array') return Array.isArray(value) && value.length <= (rule.maxItems ?? 100) && value.every((item) => rule.items && validField(item, rule.items))
  return typeof value === 'string' && value.trim().length >= (rule.minLength ?? 0) && value.length <= (rule.maxLength ?? 4000) && (!rule.enum || rule.enum.includes(value)) && (!rule.pattern || new RegExp(rule.pattern).test(value))
}
export function matchRoute(route: Route, path: string): Record<string, string> | null {
  const pattern = route.path.split('/'); const actual = path.split('/')
  if (pattern.length !== actual.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(':')) {
      try { params[pattern[i].slice(1)] = decodeURIComponent(actual[i]) } catch { throw new ApiError(400, 'INVALID_PATH', 'Invalid URL encoding') }
    } else if (pattern[i] !== actual[i]) return null
  }
  return params
}
export function openApi(routes: Route[]) {
  const paths: Record<string, any> = {}
  for (const route of routes) {
    const path = route.path.replace(/:([^/]+)/g, '{$1}')
    paths[path] ||= {}
    paths[path][route.method.toLowerCase()] = {
      summary: route.summary, security: [{ telegram: [] }], 'x-hub-permission': route.permission || null,
      parameters: (route.path.match(/:[^/]+/g) || []).map((name) => ({ name: name.slice(1), in: 'path', required: true, schema: { type: 'string' } })),
      ...(route.body ? { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, ...route.body } } } } } : {}),
      responses: { '200': { description: 'JSON envelope { data, meta?, applied?, delivery? }' }, '201': { description: 'Created' }, '400': { description: 'Malformed JSON' }, '401': { description: 'Invalid or expired Telegram authorization' }, '403': { description: 'Missing permission' }, '404': { description: 'Resource not found' }, '409': { description: 'Domain conflict' }, '422': { description: 'Invalid input' }, '429': { description: 'Rate limited' }, '502': { description: 'Telegram unavailable' } },
    }
  }
  return { openapi: '3.1.0', info: { title: 'HUB API', version: '1.0.0' }, paths, components: { securitySchemes: { telegram: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'tma <Telegram.WebApp.initData>. dev <telegramId> only on a local development server.' } } } }
}
