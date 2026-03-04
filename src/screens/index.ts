import { registerScreens } from '../core/render.js'
import { mainScreen } from './main.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { profileScreen } from './profile.js'
import { addSubscriptionScreen } from './add-subscription.js'
import { propresenterScreen } from './propresenter.js'
import { contentScreensScreen } from './content-screens.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number) => ScreenView> = {
    main: mainScreen,

    // временные заглушки
    profile: profileScreen,

    my_subscriptions: mainScreen,
    add_subscription: addSubscriptionScreen,
    propresenter: propresenterScreen,
    contentScreens: contentScreensScreen,
    chat: mainScreen,
    faq_propresenter: mainScreen,
    faq_content_screens: mainScreen,
    help: mainScreen,
    legal: mainScreen,
    faq_hub: mainScreen,
    payment: mainScreen,
    payment_info: mainScreen,
    other: mainScreen,
  }

  registerScreens(registry)
}
