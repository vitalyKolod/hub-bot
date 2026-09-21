import type { IncomingMessage, ServerResponse } from 'node:http'

export type JsonValue = unknown

export function sendJson(response: ServerResponse, status: number, body: JsonValue) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'no-referrer',
  })
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
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
