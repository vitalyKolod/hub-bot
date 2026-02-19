import { registerScreens } from '../core/render.js'
import { mainScreen } from './main.js'
import type { ScreenId } from '../state/ui.js'
import type { ScreenView } from '../core/render.js'
import { profileScreen } from './profile.js'

export function initScreens() {
  const registry: Record<ScreenId, (userId: number) => ScreenView> = {
    main: mainScreen,

    // временные заглушки
    profile: mainScreen,

    my_subscriptions: mainScreen,
    add_subscription: mainScreen,
    catalog: mainScreen,
    help: mainScreen,
    faq_hub: mainScreen,
    payment: mainScreen,
    other: mainScreen,
  }

  registerScreens(registry)
}
