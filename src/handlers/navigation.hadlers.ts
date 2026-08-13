import { goTo, goBack, goHome } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import type { MyContext } from '../types/context.js'
import type { CbData } from '../core/callback.js'

export async function handleOpen(ctx: MyContext, userId: number, parsed: CbData) {
  if (!parsed.s) return
  goTo(userId, parsed.s, parsed.p)
  await renderScreen(ctx, userId, parsed.s, parsed.p)
}

export async function handleBack(ctx: MyContext, userId: number) {
  const prev = goBack(userId)
  await renderScreen(ctx, userId, prev.screen, prev.params)
}

export async function handleHome(ctx: MyContext, userId: number) {
  goHome(userId)
  await renderScreen(ctx, userId, 'main')
}
