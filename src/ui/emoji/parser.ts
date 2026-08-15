import type { MessageEntity } from '@grammyjs/types'
import { CUSTOM_EMOJIS } from './icons.js'

export function emojiText(source: string) {
  const entities: MessageEntity[] = []

  const regex = /:([a-zA-Z0-9_-]+):/g

  let result = ''
  let lastIndex = 0

  let match: RegExpExecArray | null

  while ((match = regex.exec(source))) {
    const [placeholder, name] = match

    result += source.slice(lastIndex, match.index)

    const icon = CUSTOM_EMOJIS[name as keyof typeof CUSTOM_EMOJIS]

    if (!icon) {
      result += placeholder
      lastIndex = regex.lastIndex
      continue
    }

    const offset = [...result].length

    result += icon.emoji

    entities.push({
      type: 'custom_emoji',
      offset,
      length: [...icon.emoji].length,
      custom_emoji_id: icon.id,
    })

    lastIndex = regex.lastIndex
  }

  result += source.slice(lastIndex)

  return [
    result,
    {
      entities,
    },
  ] as const
}
