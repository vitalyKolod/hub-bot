import { goTo, goBack, goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import type { MyContext } from '../types/context.js'
import type { CbData } from '../core/callback.js'
import { clearInputMode } from '../services/user.service.js'

export async function handleOpen(ctx: MyContext, userId: number, parsed: CbData) {
  if (!parsed.s) return
  await clearInputMode(userId)
  goTo(userId, parsed.s, parsed.p)
  await renderScreen(ctx, userId, parsed.s, parsed.p)
}

export async function handleBack(ctx: MyContext, userId: number) {
  await clearInputMode(userId)
  const prev = goBack(userId)
  await renderScreen(ctx, userId, prev.screen, prev.params)
}

export async function handleHome(ctx: MyContext, userId: number) {
  await clearInputMode(userId)
  goHome(userId)
  await renderScreen(ctx, userId, 'main')
}
