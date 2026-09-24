import { InputFile, InlineKeyboard, type Context } from 'grammy'
import { HELP_PHOTO, supportScreen } from '../screens/support.js'
import { setUiMessageId } from '../state/ui.js'

export type SupportUiState = {
  supportUiMessageId?: number
  supportUiOpened?: boolean
}
type SupportUiContext = Context & { session: SupportUiState }

/** Only IDs registered by the bot's Help/photo renderer; never incoming user messages. */
export async function renderSupportUi(ctx: SupportUiContext, text: string, keyboard: InlineKeyboard) {
  // Plain-text captions: cap UTF-16 length conservatively, without splitting emoji.
  const caption = text.length <= 1024 ? text : text.slice(0, 1023).replace(/[\uD800-\uDBFF]$/, '') + '…'
  const messageId = ctx.session.supportUiMessageId
  if (messageId) {
    try {
      await ctx.api.editMessageCaption(ctx.chat!.id, messageId, { caption, reply_markup: keyboard })
      return messageId
    } catch (error) {
      const description = String((error as { description?: string; message?: string })?.description || (error as Error)?.message || '')
      if (/message is not modified/i.test(description)) return messageId
      if (!/message (?:to edit )?not found|message (?:can't|cannot) be edited|message_id_invalid/i.test(description)) throw error
      // Deleted/expired Help: replace it with the same photo.
    }
  }
  const sent = await ctx.replyWithPhoto(new InputFile(HELP_PHOTO), { caption, reply_markup: keyboard })
  ctx.session.supportUiMessageId = sent.message_id
  setUiMessageId(ctx.from!.id, sent.message_id)
  return sent.message_id
}

/** UI-only follow-up after successful delivery; UI failures must not report relay failure. */
export async function markSupportUiOpened(ctx: SupportUiContext) {
  if (!ctx.session.supportUiMessageId || ctx.session.supportUiOpened) return
  try {
    await renderSupportUi(
      ctx,
      '💬 ПОДДЕРЖКА\n\nОбращение открыто.\n\nМожете отправлять текст, фото, видео, документы и голосовые сообщения.',
      new InlineKeyboard().text('✅ Завершить обращение', 'support:close:user')
    )
    ctx.session.supportUiOpened = true
  } catch (error) {
    console.error('Не удалось обновить служебную карточку Support:', error)
  }
}

/** Preserve the existing close operation; only replace its private UI notification. */
export async function markSupportUiClosed(ctx: SupportUiContext, text: string) {
  if (!ctx.session.supportUiMessageId) return false
  try {
    await renderSupportUi(ctx, `💬 ПОДДЕРЖКА\n\n${text}`, new InlineKeyboard().text('Написать в поддержку', 'support:start'))
    ctx.session.supportUiOpened = false
    return true
  } catch (error) {
    console.error('Не удалось обновить закрытую карточку Support:', error)
    return false
  }
}

/** Return from categories without replacing the photo or creating a ticket. */
export async function renderHelpUi(ctx: SupportUiContext) {
  const view = supportScreen(ctx.from!.id)
  return renderSupportUi(ctx, view.caption, view.keyboard)
}
