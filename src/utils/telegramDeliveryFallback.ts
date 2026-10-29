import type { Transformer } from 'grammy'

/** Retry only Telegram validation errors that can be made safe without changing the message target. */
export const telegramDeliveryFallback: Transformer = async (prev, method, payload, signal) => {
  let currentPayload: any = payload
  let response = await prev(method, payload, signal)
  let removedProfileButton = false
  let removedFormatting = false

  for (let attempt = 0; attempt < 2 && !response.ok; attempt++) {
    const description = String(response.description || '')
    if (!removedProfileButton && description.includes('BUTTON_USER_PRIVACY_RESTRICTED')) {
      const markup = currentPayload.reply_markup
      const rows = markup?.inline_keyboard
      if (!Array.isArray(rows)) break
      const safeRows = rows.map((row: any[]) => row.filter((button) =>
        !('url' in button && /^tg:\/\/user\?id=\d+$/.test(button.url))
      )).filter((row: any[]) => row.length)
      if (safeRows.length === rows.length && safeRows.every((row: any[], index: number) => row.length === rows[index].length)) break
      currentPayload = {
        ...currentPayload,
        reply_markup: { ...markup, inline_keyboard: safeRows },
      }
      if (!safeRows.length && method !== 'editMessageReplyMarkup') delete currentPayload.reply_markup
      removedProfileButton = true
      console.warn(`[telegram] ${method}: removed privacy-restricted profile button`)
    } else if (!removedFormatting && /can't parse entities/i.test(description)) {
      if (typeof currentPayload.text !== 'string' && typeof currentPayload.caption !== 'string') break
      if (!currentPayload.parse_mode && !currentPayload.entities && !currentPayload.caption_entities) break
      currentPayload = { ...currentPayload }
      delete currentPayload.parse_mode
      delete currentPayload.entities
      delete currentPayload.caption_entities
      removedFormatting = true
      console.warn(`[telegram] ${method}: sent without rejected formatting`)
    } else {
      break
    }
    response = await prev(method, currentPayload, signal)
  }

  return response
}
