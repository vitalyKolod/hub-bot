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
import { legalScreen } from './legal.js'
import { paymentScreen } from './payment.js'
import { paymentDetailsScreen } from './payment-detail.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number, params?: any) => ScreenView> = {
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
    legal: legalScreen,
    pay_method: mainScreen,
    chat: mainScreen,
    faq_propresenter: mainScreen,
    faq_content_screens: mainScreen,
    help: mainScreen,
    payment: paymentScreen,
    payment_details: paymentDetailsScreen,
  }

  registerScreens(registry)
}
