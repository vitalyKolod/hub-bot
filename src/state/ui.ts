export type ScreenId =
  | 'main'
  | 'profile'
  | 'my_subscriptions'
  | 'add_subscription'
  | 'chat'
  | 'product'
  | 'help'
  | 'faq_hub'
  | 'legal'
  | 'payment'
  | 'payment_info'
  | 'other'

export type UiState = {
  userId: number
  uiMessageId?: number
  current: ScreenId
  stack: ScreenId[] // для "Назад"
}

const ui = new Map<number, UiState>()

export function getUi(userId: number): UiState {
  let s = ui.get(userId)
  if (!s) {
    s = { userId, current: 'main', stack: [] }
    ui.set(userId, s)
  }
  return s
}

export function setUiMessageId(userId: number, messageId: number) {
  const s = getUi(userId)
  s.uiMessageId = messageId
}

export function goTo(userId: number, screen: ScreenId) {
  const s = getUi(userId)
  if (s.current !== screen) s.stack.push(s.current)
  s.current = screen
}

export function goBack(userId: number): ScreenId {
  const s = getUi(userId)
  const prev = s.stack.pop()
  if (prev) s.current = prev
  return s.current
}

export function goHome(userId: number) {
  const s = getUi(userId)
  s.stack = []
  s.current = 'main'
}
