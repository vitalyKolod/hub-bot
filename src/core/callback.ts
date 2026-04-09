import type { ScreenId } from '../state/ui.js'

export type ActionId =
  | 'open' // открыть экран
  | 'back' // назад
  | 'home' // на главную
  | 'pay_method'
  | 'noop' // ничего (заглушка)
  | 'pay_product'
  | 'crypto_selected'
  | 'rub_method'
  | 'rub_payment'
  | 'paid'
  | 'accept'
  | 'rub_card_type'
  | 'rub_bank'
  | 'rub_card_methods'
  | 'rub_type'
  | 'reject'
  | 'crypto_network'
  | 'crypto_payment'

export type CbData = {
  a: ActionId
  s?: ScreenId
  p?: string | Record<string, any>
  m?: string
}

export function packCb(d: Record<string, any>): string {
  const parts: string[] = []

  // Проходим по всем ключам объекта
  Object.entries(d).forEach(([key, value]) => {
    if (value === undefined || value === null) return

    let encodedValue: string

    if (typeof value === 'string') {
      // обычная строка — просто url-encode
      encodedValue = encodeURIComponent(value)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // числа и булевы — как есть
      encodedValue = String(value)
    } else {
      // объекты/массивы — json → base64
      const json = JSON.stringify(value)
      encodedValue = Buffer.from(json).toString('base64')
    }

    parts.push(`${key}=${encodedValue}`)
  })

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
