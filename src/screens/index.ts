import { registerScreens } from '../core/render.js'
import { mainScreen } from './main.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { profileScreen } from './profile.js'
import { addSubscriptionScreen } from './add-subscription.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number) => ScreenView> = {
    main: mainScreen,

    // временные заглушки
    profile: profileScreen,

    my_subscriptions: mainScreen,
    add_subscription: addSubscriptionScreen,
    chat: mainScreen,
    product: mainScreen,
    help: mainScreen,
    legal: mainScreen,
    faq_hub: mainScreen,
    payment: mainScreen,
    payment_info: mainScreen,
    other: mainScreen,
  }

  registerScreens(registry)
}
