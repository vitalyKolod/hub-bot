import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

const cover = './public/tutorials.png'
const directory = join(process.cwd(), 'public', 'tutorials')

export const tutorials = [
  { id: 'create-team', title: 'Как создать команду' },
  { id: 'join-team', title: 'Как вступить в команду' },
  { id: 'buy-subscription', title: 'Как купить подписку' },
  { id: 'buy-multiple-subscriptions', title: 'Как купить несколько подписок' },
  { id: 'check-subscription-and-access', title: 'Как проверить подписку и найти доступ' },
  { id: 'add-team-member', title: 'Как добавить участника в команду' },
  { id: 'renew-subscription', title: 'Как продлить подписку' },
  { id: 'connect-propresenter', title: 'Как подключить ProPresenter' },
  { id: 'contact-support', title: 'Как написать в поддержку' },
] as const

export function tutorialsScreen(): ScreenView {
  const keyboard = new InlineKeyboard()
  for (const tutorial of tutorials) {
    keyboard.text(tutorial.title, packCb({ a: 'open', s: 'tutorial', p: tutorial.id })).row()
  }
  keyboard.text('◀️ НАЗАД', packCb({ a: 'back' }))

  return {
    photo: cover,
    caption: 'ТУТОРИАЛЫ\n\nКороткие видео покажут, как выполнить основные действия в боте. Выберите нужную тему ниже.',
    keyboard,
  }
}

export function tutorialScreen(_userId: number, id?: string): ScreenView {
  const tutorial = tutorials.find((item) => item.id === id)
  const keyboard = new InlineKeyboard().text('◀️ НАЗАД', packCb({ a: 'back' }))
  if (!tutorial) {
    return { photo: cover, caption: 'Туториал не найден.', keyboard }
  }

  const path = join(directory, `${tutorial.id}.mp4`)
  const available = existsSync(path) && statSync(path).isFile() && statSync(path).size > 0

  return {
    photo: cover,
    video: available ? path : undefined,
    caption: available
      ? tutorial.title
      : `${tutorial.title}\n\nВидео скоро появится.`,
    keyboard,
  }
}
