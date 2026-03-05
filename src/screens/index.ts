import { registerScreens } from '../core/render.js'
import { mainScreen } from './main.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { profileScreen } from './profile.js'
import { addSubscriptionScreen } from './add-subscription.js'
import { propresenterScreen } from './propresenter.js'
import { contentScreensScreen } from './content-screens.js'
import { otherScreen } from './others.js'
import { faqHubScreen } from './faq-hub.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number) => ScreenView> = {
    main: mainScreen,

    // временные заглушки
    profile: profileScreen,

    my_subscriptions: mainScreen,
    add_subscription: addSubscriptionScreen,
    propresenter: propresenterScreen,
    contentScreens: contentScreensScreen,
    faq_hub: faqHubScreen,
    other: otherScreen,
    admin_chat: mainScreen,
    chat: mainScreen,
    faq_propresenter: mainScreen,
    faq_content_screens: mainScreen,
    help: mainScreen,
    legal: mainScreen,
    payment: mainScreen,
    payment_info: mainScreen,
  }

  registerScreens(registry)
}
