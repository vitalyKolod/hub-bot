import { InputFile, InlineKeyboard } from 'grammy'
import { renderSupportUi } from '../ui/supportUi.js'
import type { MessageEntity } from 'grammy/types'

import { getUi, setUiMessageId } from '../state/ui.js'
import type { ScreenId } from '../state/ui.js'

export type ScreenView = {
  photo: string
  video?: string
  mediaIsFileId?: boolean
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
  const media = view.video
    ? { type: 'video' as const, media: view.mediaIsFileId ? view.video : new InputFile(view.video), caption: view.caption, caption_entities: view.caption_entities }
    : { type: 'photo' as const, media: view.mediaIsFileId ? view.photo : new InputFile(view.photo), caption: view.caption, caption_entities: view.caption_entities }

  const isHelp = screenId === 'support'
  if (isHelp && !options?.forceNew && ui.uiMessageId && ctx.session?.supportUiMessageId === ui.uiMessageId) {
    await renderSupportUi(ctx, view.caption, view.keyboard)
    ctx.session.supportUiOpened = false
    return
  }
  // A shared menu message may now display another screen, so it is no longer a Help target.
  const registerRenderedMessage = (messageId: number) => {
    if (!ctx.session) return
    if (isHelp) {
      ctx.session.supportUiMessageId = messageId
      ctx.session.supportUiOpened = false
    } else if (ctx.session.supportUiMessageId === messageId) {
      ctx.session.supportUiMessageId = undefined
      ctx.session.supportUiOpened = false
    }
  }

  // =========================================================
  // 1. РЕДАКТИРУЕМ СУЩЕСТВУЮЩЕЕ СООБЩЕНИЕ
  // =========================================================

  if (ui.uiMessageId && !options?.forceNew) {
    try {
      await ctx.api.editMessageMedia(
        userId,
        ui.uiMessageId,
        media,
        {
          reply_markup: view.keyboard,
        }
      )

      registerRenderedMessage(ui.uiMessageId)
      return
    } catch (err: any) {
      const msg = String(err?.description || err?.message || '')

      if (msg.includes('message is not modified')) {
        registerRenderedMessage(ui.uiMessageId)
        return
      }

      // Если старое сообщение нельзя изменить —
      // создаём новое ниже.
    }
  }

  // =========================================================
  // 2. СОЗДАЁМ НОВОЕ СООБЩЕНИЕ
  // =========================================================

  const replyOptions = {
    caption: view.caption,
    caption_entities: view.caption_entities,
    reply_markup: view.keyboard,
  }
  const sent = view.video
    ? await ctx.replyWithVideo(view.mediaIsFileId ? view.video : new InputFile(view.video), replyOptions)
    : await ctx.replyWithPhoto(view.mediaIsFileId ? view.photo : new InputFile(view.photo), replyOptions)

  setUiMessageId(userId, sent.message_id)
  registerRenderedMessage(sent.message_id)
}
