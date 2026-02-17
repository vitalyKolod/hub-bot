import type { ScreenId } from '../state/ui.js'

export type ActionId =
  | 'open' // открыть экран
  | 'back' // назад
  | 'home' // на главную
  | 'noop' // ничего (заглушка)

export type CbData = {
  a: ActionId
  s?: ScreenId
  p?: string // короткий payload (например id категории/товара)
}

// Формат: a=open&s=help&p=faq
// (простой, читаемый, хватает для большинства UI)
export function packCb(d: CbData): string {
  const parts: string[] = [`a=${d.a}`]
  if (d.s) parts.push(`s=${d.s}`)
  if (d.p) parts.push(`p=${encodeURIComponent(d.p)}`)
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
    const p = obj.p ? decodeURIComponent(obj.p) : undefined

    return { a, s, p }
  } catch {
    return null
  }
}
