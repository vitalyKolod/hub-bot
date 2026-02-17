import { InputFile, InlineKeyboard } from 'grammy'
import { getUi, setUiMessageId } from '../state/ui.js'
import type { ScreenId } from '../state/ui.js'

export type ScreenView = {
  photo: string
  caption: string
  keyboard: InlineKeyboard
}

type ScreenRegistry = Record<ScreenId, (userId: number) => ScreenView>

/**
 * Здесь будет регистрироваться набор экранов.
 * Пока временно оставим пустым — подключим в следующем шаге.
 */
let screens: ScreenRegistry = {} as any

export function registerScreens(registry: ScreenRegistry) {
  screens = registry
}

/**
 * Главная функция рендера.
 * 1) Пытаемся отредактировать существующий UI message
 * 2) Если не получилось — создаём новый и сохраняем его id
 */
export async function renderScreen(ctx: any, userId: number, screenId: ScreenId) {
  const ui = getUi(userId)

  const screenFactory = screens[screenId]
  if (!screenFactory) {
    throw new Error(`Screen "${screenId}" not registered`)
  }

  const view = screenFactory(userId)

  // 1️⃣ Пытаемся редактировать существующее сообщение
  if (ui.uiMessageId) {
    try {
      await ctx.api.editMessageMedia(
        userId,
        ui.uiMessageId,
        {
          type: 'photo',
          media: new InputFile(view.photo),
          caption: view.caption,
          parse_mode: 'Markdown',
        },
        {
          reply_markup: view.keyboard,
        }
      )
      return
    } catch (err: any) {
      const msg = String(err?.description || err?.message || '')

      // Если просто "message is not modified" — игнорируем
      if (msg.includes('message is not modified')) {
        return
      }

      // Иначе — сообщение потеряно или нельзя редактировать
      // Переходим к созданию нового
    }
  }

  // 2️⃣ Создаём новое UI сообщение
  const sent = await ctx.replyWithPhoto(new InputFile(view.photo), {
    caption: view.caption,
    parse_mode: 'Markdown',
    reply_markup: view.keyboard,
  })

  setUiMessageId(userId, sent.message_id)
}
