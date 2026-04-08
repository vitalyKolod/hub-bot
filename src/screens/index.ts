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
import { aboutPaymentScreen } from './about-payment.js'
import { rubPaymentScreen } from './rub-payments.js'
import { cryptoPaymentScreen } from './crypto-payment.js'
import { supportScreen } from './support.js'
import { cryptoMethodScreen } from './crypto-method.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number, params?: any, ctx?: any) => ScreenView> = {
    main: mainScreen,

    // временные заглушки
    profile: profileScreen,

    my_subscriptions: mainScreen,
    //add subscription
    add_subscription: addSubscriptionScreen,

    propresenter: propresenterScreen,
    faq_propresenter: mainScreen,

    contentScreens: contentScreensScreen,
    faq_content_screens: mainScreen,

    other: otherScreen,
    faq_hub: faqHubScreen,
    legal: legalScreen,
    about_payment: aboutPaymentScreen,
    rub_payment: rubPaymentScreen,

    payment: paymentScreen,
    crypto_method: cryptoMethodScreen,
    crypto_payment: cryptoPaymentScreen,
    payment_details: paymentDetailsScreen,
    admin_chat: mainScreen,
    pay_method: mainScreen,
    chat: mainScreen,
    help: mainScreen,

    support: supportScreen,
  }

  registerScreens(registry)
}
