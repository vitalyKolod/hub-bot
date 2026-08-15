import { InputFile, InlineKeyboard } from 'grammy'
import type { MessageEntity } from 'grammy/types'

import { getUi, setUiMessageId } from '../state/ui.js'
import type { ScreenId } from '../state/ui.js'

export type ScreenView = {
  photo: string
  caption: string
  keyboard: InlineKeyboard
  caption_entities?: MessageEntity[]
}

type ScreenRegistry = Record<
  ScreenId,
  (userId: number, params?: any, ctx?: any) => Promise<ScreenView> | ScreenView
>

let screens: ScreenRegistry = {} as ScreenRegistry

export function registerScreens(registry: ScreenRegistry) {
  screens = registry
}

export async function renderScreen(
  ctx: any,
  userId: number,
  screenId: ScreenId,
  params?: any,
  options?: { forceNew?: boolean }
) {
  const ui = getUi(userId)

  const screenFactory = screens[screenId]

  if (!screenFactory) {
    throw new Error(`Screen "${screenId}" not registered`)
  }

  const view = await screenFactory(userId, params, ctx)

  // =========================================================
  // 1. РЕДАКТИРУЕМ СУЩЕСТВУЮЩЕЕ СООБЩЕНИЕ
  // =========================================================

  if (ui.uiMessageId && !options?.forceNew) {
    try {
      await ctx.api.editMessageMedia(
        userId,
        ui.uiMessageId,
        {
          type: 'photo',
          media: new InputFile(view.photo),

          caption: view.caption,

          // 👇 ВОТ ЭТОГО НЕ ХВАТАЛО
          caption_entities: view.caption_entities,
        },
        {
          reply_markup: view.keyboard,
        }
      )

      return
    } catch (err: any) {
      const msg = String(err?.description || err?.message || '')

      if (msg.includes('message is not modified')) {
        return
      }

      // Если старое сообщение нельзя изменить —
      // создаём новое ниже.
    }
  }

  // =========================================================
  // 2. СОЗДАЁМ НОВОЕ СООБЩЕНИЕ
  // =========================================================

  const sent = await ctx.replyWithPhoto(new InputFile(view.photo), {
    caption: view.caption,

    // 👇 И ЗДЕСЬ ПЕРЕДАЁМ ENTITIES
    caption_entities: view.caption_entities,

    reply_markup: view.keyboard,
  })

  setUiMessageId(userId, sent.message_id)
}
