import { emojiText } from './parser.js'

export function replyText(text: string) {
  const parsed = emojiText(text)

  return [
    parsed.text,
    {
      entities: parsed.entities,
    },
  ] as const
}

export function replyCaption(text: string) {
  const parsed = emojiText(text)

  return {
    caption: parsed.text,
    caption_entities: parsed.entities,
  }
}
