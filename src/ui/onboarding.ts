import { InlineKeyboard, InputFile } from 'grammy'

export type OnboardingStep = 0 | 1 | 2

export const ONBOARDING_ASSET = new InputFile('./public/welcome.png')

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
  const total = PAGES.length
  const last = (total - 1) as OnboardingStep

  const kb = new InlineKeyboard()

  // Стрелки умные: показываем только доступные
  if (step > 0) kb.text('◀️', `ui:onb:${step - 1}`)
  if (step < last) kb.text('▶️', `ui:onb:${step + 1}`)

  // Чтобы кнопки не “прилипали” в один ряд при одиночной стрелке — ряд завершаем
  kb.row()

  // Подтверждение — только на последней странице
  if (step === last) {
    kb.text('ПОДТВЕРДИТЬ И НАЧАТЬ', 'ui:onb:confirm')
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
