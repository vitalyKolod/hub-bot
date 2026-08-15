import { InlineKeyboard, InputFile } from 'grammy'

export type OnboardingStep = 0 | 1 | 2 | 3

export const ONBOARDING_ASSET = new InputFile('./public/welcome.jpg')

const PAGES = [
  {
    title: 'Что умеет бот',
    text: [
      '• Управление подписками',
      '• Оплата и подтверждение',

      '• FAQ по ХАБу и продуктам',
      '• Связь с админом',
    ],
  },
  {
    title: 'Что такое ХАБ',
    text: [
      'ХАБ — это сервис, который помогает с цифровыми подписками и доступами.',
      'Внутри — каталог, поддержка и всё по подпискам в одном месте.',
    ],
  },
  {
    title: 'Юридическая информация',
    text: [
      'Информация в боте носит справочный характер.',
      'Оплачивая услуги, вы соглашаетесь с правилами сервиса.',
    ],
  },
  {
    title: 'Давайте знакомиться!',
    text: [
      'Введите данные последовательно, как от вас это требует бот',
      'Если на каком то шаше вы допустили ошибку, не переживайте — вы сможете внести правки в конце регистрации',
      '*Просто продолжайте регистрацию*',
    ],
  },
] as const

export function clampStep(n: number): OnboardingStep {
  if (n <= 0) return 0
  if (n >= PAGES.length - 1) return (PAGES.length - 1) as OnboardingStep
  return n as OnboardingStep
}

export function getOnboardingCaption(step: OnboardingStep): string {
  const page = PAGES[step]
  const total = PAGES.length
  const num = step + 1
  return [`*${page.title}*`, `_${num}/${total}_`, '', ...page.text].join('\n')
}

/**
 * Умная клавиатура:
 * - На первой странице нет ◀️
 * - На последней нет ▶️
 * - Кнопка "ПОДТВЕРДИТЬ И НАЧАТЬ" появляется ТОЛЬКО на последней странице
 */
export function getOnboardingKeyboard(step: OnboardingStep): InlineKeyboard {
  const kb = new InlineKeyboard()

  switch (step) {
    case 0:
      kb.text('ВПЕРЕД ▶️', 'ui:onb:1')
      break

    case 1:
      kb.text('◀️ НАЗАД', 'ui:onb:0').text('ВПЕРЕД ▶️', 'ui:onb:2')
      break

    case 2:
      kb.text('СОГЛАСИТЬСЯ', 'ui:onb:3').style('success').icon('5237794483843655211')
      break

    case 3:
      kb.text('ЗАРЕГИСТРИРОВАТЬСЯ', 'ui:onb:confirm').style('success').icon('5188481279963715781')
      break
  }

  return kb
}

export function isOnboardingCallback(data: string): boolean {
  return data === 'ui:onb:start' || data.startsWith('ui:onb:') // start, 0/1/2, confirm
}

export function parseOnboardingCallback(
  data: string
): { type: 'start' } | { type: 'page'; step: OnboardingStep } | { type: 'confirm' } | null {
  if (data === 'ui:onb:start') return { type: 'start' }
  if (data === 'ui:onb:confirm') return { type: 'confirm' }

  if (data.startsWith('ui:onb:')) {
    const raw = data.split(':')[2]
    const n = Number(raw)
    if (Number.isFinite(n)) return { type: 'page', step: clampStep(n) }
  }

  return null
}
