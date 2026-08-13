export type ScreenId =
  | 'main'
  | 'profile'
  | 'my_subscriptions'
  | 'cart'
  | 'team_list'
  | 'team'
  | 'create_team_info'
  | 'create_team_name'
  | 'add_subscription'
  | 'propresenter'
  | 'prop_has_stream'
  | 'propresenter_no_stream'
  | 'propresenter_streams'
  | 'propresenter_confirm'
  | 'prop_no_stream'
  | 'pro_content'
  | 'faq_propresenter'
  | 'contentScreens'
  | 'admin_chat'
  | 'faq_learning'
  | 'about_payment'
  | 'faq_other'
  | 'add_volunteer'
  | 'rub_payment'
  | 'crypto_payment'
  | 'crypto_method'
  | 'chat'
  | 'paid'
  | 'help'
  | 'faq_hub'
  | 'faq_content_screens'
  | 'legal'
  | 'payment'
  | 'payment_details'
  | 'pay_method'
  | 'payment_info'
  | 'other'
  | 'support'
  | 'rub_card_methods'
  | 'rub_methods'
  | 'rub_sbp_methods'
  | 'end_support'
  | 'team_invite'

export type StackEntry = {
  screen: ScreenId
  params?: any
}

export type UiState = {
  userId: number
  uiMessageId?: number
  current: ScreenId
  currentParams?: any
  stack: StackEntry[]
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

export function goTo(userId: number, screen: ScreenId, params?: any) {
  const s = getUi(userId)
  if (s.current !== screen) {
    s.stack.push({ screen: s.current, params: s.currentParams })
  }
  s.current = screen
  s.currentParams = params
}

export function goBack(userId: number): StackEntry {
  const s = getUi(userId)
  const prev = s.stack.pop()
  if (prev) {
    s.current = prev.screen
    s.currentParams = prev.params
  }
  return { screen: s.current, params: s.currentParams }
}

export function goHome(userId: number) {
  const s = getUi(userId)
  s.stack = []
  s.current = 'main'
  s.currentParams = undefined
}
