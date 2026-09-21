export function telegramWebApp() { return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp }

export function initializeTelegramWebApp() {
  const telegram = telegramWebApp()
  if (!telegram) return false
  try { telegram.ready() } catch (error) { console.warn('[HUB Telegram] ready() is unavailable', error) }
  try { telegram.expand() } catch (error) { console.warn('[HUB Telegram] expand() is unavailable', error) }
  return true
}

export function telegramDiagnostics() {
  if (typeof window === 'undefined') return { runtime: 'server' as const }
  const telegram = telegramWebApp()
  const launchParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    runtime: 'browser' as const,
    sdkLoaded: Boolean(telegram),
    sdkInitDataLength: telegram?.initData?.length || 0,
    launchInitDataLength: launchParams.get('tgWebAppData')?.length || 0,
    version: telegram?.version || 'unknown',
    platform: telegram?.platform || 'unknown',
    origin: window.location.origin,
    devAuthEnabled: process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH === 'true',
  }
}

function telegramInitData() {
  if (typeof window === 'undefined') return ''
  const sdkInitData = telegramWebApp()?.initData
  if (sdkInitData) return sdkInitData

  const launchParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return launchParams.get('tgWebAppData') || ''
}

export function authHeader() {
  const initData = telegramInitData()
  if (initData) {
    console.info('[HUB auth] Telegram initData found', telegramDiagnostics())
    return `tma ${initData}`
  }
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH === 'true' && process.env.NEXT_PUBLIC_DEV_AUTH_USER_ID) {
    console.warn('[HUB auth] Using browser-only dev auth')
    return `dev ${process.env.NEXT_PUBLIC_DEV_AUTH_USER_ID}`
  }
  const diagnostics = telegramDiagnostics()
  console.error('[HUB auth] Telegram initData is missing', diagnostics)
  throw new Error('Авторизация недоступна. Откройте HUB в Telegram или включите dev-auth для локальной разработки.')
}
export function haptic(type:'selection'|'success'|'error'='selection') {
  const feedback=telegramWebApp()?.HapticFeedback
  if (!feedback) return
  try { if(type==='selection') feedback.selectionChanged(); else feedback.notificationOccurred(type) } catch { /* Unsupported clients are a no-op. */ }
}
