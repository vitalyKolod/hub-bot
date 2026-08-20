import { registerScreens } from '../core/render.js'
import { mainScreen } from './main.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { profileScreen } from './profile.js'
import { addSubscriptionScreen } from './add-subscription.js'
import { propresenterScreen } from './propresenter.js'
import { contentScreensScreen, procontentScreen } from './content-screens.js'
import { otherScreen } from './others.js'
import { faqHubScreen } from './faq-hub.js'
import { legalScreen } from './legal.js'
import { paymentScreen } from './payment.js'
import { paymentDetailsScreen } from './payment-detail.js'
import { aboutPaymentScreen } from './about-payment.js'
import { rubMethodsScreen } from './rub-methods.js'
import { cryptoPaymentScreen } from './crypto-payment.js'
import { supportScreen } from './support.js'
import { cryptoMethodScreen } from './crypto-method.js'
import { cardMethods } from './cards-metods.js'
import { sbpMethodsScreen } from './sbp-methods.js'
import { rubPaymentScreen } from './rub-payment.js'
import { SundayScreensScreen } from './sunday-screens.js'
import { addVolunteerScreen } from './volunteer-add.js'
import { teamListScreen } from './team-list.js'
import { createTeamInfoScreen } from './create-team-info.js'
import { createTeamNameScreen } from './create-team-name.js'
import { teamScreen } from './team.js'
import { cartScreen } from './cart.js'
import { teamInviteScreen } from './team-invite.js'
import { contentMenuScreen } from './content-menu.js'
import { cmgScreen } from './cmg.js'
import { cgsScreen } from './cgs.js'
import { storyloopsScreen } from './storyloops.js'
import { propresenterCheckScreen } from './propresenter-check.js'
import { propresenterStreamsScreen } from './propresenter-streams.js'
import { propresenterNoStreamScreen } from './propresenter-no-stream.js'
import { propresenterConfirmScreen } from './propresenter-confirm.js'

export function initScreens() {
  const registry: Record<
    ScreenId,
    (userId: number, params?: any, ctx?: any) => ScreenView | Promise<ScreenView>
  > = {
    main: mainScreen,

    // временные заглушки
    profile: profileScreen,

    my_subscriptions: mainScreen,
    //add subscription
    add_subscription: addSubscriptionScreen,
    add_volunteer: addVolunteerScreen,

    propresenter: propresenterScreen,
    propresenter_no_stream: propresenterNoStreamScreen,
    propresenter_confirm: propresenterConfirmScreen,
    propresenter_check: propresenterCheckScreen,
    propresenter_streams: propresenterStreamsScreen,
    faq_propresenter: mainScreen,

    // content_screens: contentScreensScreen,
    procontent: procontentScreen,
    cmg: cmgScreen,
    cgs: cgsScreen,
    faq_content_screens: mainScreen,
    storyloops: storyloopsScreen,

    sunday_screens: SundayScreensScreen,
    content_menu: contentMenuScreen,

    other: otherScreen,
    faq_hub: faqHubScreen,
    legal: legalScreen,
    about_payment: aboutPaymentScreen,
    rub_methods: rubMethodsScreen,
    rub_card_methods: cardMethods,
    rub_sbp_methods: sbpMethodsScreen,
    rub_payment: rubPaymentScreen,

    payment: paymentScreen,
    crypto_method: cryptoMethodScreen,
    crypto_payment: cryptoPaymentScreen,
    payment_details: paymentDetailsScreen,
    admin_chat: mainScreen,
    pay_method: mainScreen,
    chat: mainScreen,
    help: mainScreen,

    team: teamScreen,
    team_list: teamListScreen,
    team_invite: teamInviteScreen,

    cart: cartScreen,

    create_team_info: createTeamInfoScreen,

    create_team_name: createTeamNameScreen,

    support: supportScreen,
  }

  registerScreens(registry)
}
