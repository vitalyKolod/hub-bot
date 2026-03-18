import type { ScreenId } from '../state/ui.js'

export type ActionId =
  | 'open' // открыть экран
  | 'back' // назад
  | 'home' // на главную
  | 'pay_method'
  | 'noop' // ничего (заглушка)
  | 'pay_product'
  | 'rub_method'
  | 'rub_payment'

export type CbData = {
  a: ActionId
  s?: ScreenId
  p?: string | Record<string, any>
  m?: string
}

// Формат: a=open&s=help&p=faq
// (простой, читаемый, хватает для большинства UI)
export function packCb(d: CbData): string {
  const parts: string[] = [`a=${d.a}`]
  if (d.s) parts.push(`s=${d.s}`)
  if (d.p) {
    if (typeof d.p === 'string') {
      parts.push(`p=${encodeURIComponent(d.p)}`)
    } else {
      // объект → превращаем в JSON и base64, чтобы влезло в 64 байта лимита Telegram
      const json = JSON.stringify(d.p)
      parts.push(`p=${Buffer.from(json).toString('base64')}`)
    }
  }
  if (d.m) parts.push(`m=${d.m}`)
  return parts.join('&')
}

export function parseCb(raw: string): CbData | null {
  try {
    const obj: Record<string, string> = {}
    for (const part of raw.split('&')) {
      const [k, v] = part.split('=')
      if (!k) continue
      obj[k] = v ?? ''
    }

    if (!obj.a) return null

    const a = obj.a as ActionId
    const s = obj.s ? (obj.s as ScreenId) : undefined
    let p: string | Record<string, any> | undefined = obj.p ? decodeURIComponent(obj.p) : undefined

    // Декодируем p, если base64
    if (p && /^[A-Za-z0-9+/=]+$/.test(p)) {
      try {
        const decoded = Buffer.from(p, 'base64').toString()
        p = JSON.parse(decoded)
      } catch {}
    }

    // Добавляем m (method)
    const m = obj.m || undefined

    return { a, s, p, m }
  } catch {
    return null
  }
}
