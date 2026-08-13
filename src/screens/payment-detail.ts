// src/screens/payment_details.ts
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'

import type { ScreenView } from '../core/render.js'

const PAGES = [
  `1/5\n\n` +
    `Добровольные пожертвования помогают ХАБу поддерживать цифровые подписки, закрытые чаты и работу сервиса.`,

  `2/5\n\n` +
    `Поддержать проект можно рублёвым переводом или переводом в USDT. Выберите удобный для вас способ.`,

  `3/5\n\n` +
    `При переводе в USDT учитывайте комиссию биржи и выбранной сети. Сумма, которая поступит на кошелёк ХАБа, должна соответствовать рекомендуемому размеру пожертвования.`,

  `4/5\n\n` +

    ` Если вы совершаете самостоятельную покупку USDT на любой бирже через Р2Р то даже с учетом всех комиссий за перевод, такая покупка выйдет выгоднее.

Например:
подписка через ХАБ стоит 40$ + 1$ (комиссия системы за перевод) х 80₽ (или иная стоимость по актуальному курсу Р2Р рынка за USDT) получаем стоимость в рублях = 3280₽`,

    `Рекомендуемый размер пожертвования зависит от выбранного продукта. Актуальная сумма будет указана перед переводом.`,


  `5/5\n\n` +
    `После перевода нажмите «Я отправил(а)» и приложите подтверждение. Администратор проверит поступление и активирует доступ.\n\n` +
    `Если появятся вопросы, напишите администратору.`,
]

const TOTAL_PAGES = PAGES.length

export function paymentDetailsScreen(userId: number, params?: { page: number }): ScreenView {
  const page = Math.max(1, Math.min(TOTAL_PAGES, params?.page ?? 1))

  const kb = new InlineKeyboard()

  // Умные стрелки: показываем только доступные
  if (page > 1) {
    kb.text('◀️ ПРЕДЫДУЩАЯ', packCb({ a: 'open', s: 'payment_details', p: { page: page - 1 } }))
  }
  if (page < TOTAL_PAGES) {
    kb.text('СЛЕДУЮЩАЯ ▶️', packCb({ a: 'open', s: 'payment_details', p: { page: page + 1 } }))
  }

  kb.row()

  // Кнопка возврата появляется только на последней странице
  if (page === TOTAL_PAGES) {

    kb.text('НАЗАД К ОПЛАТЕ', packCb({ a: 'open', s: 'about_payment' }))
      .icon('5417959552932930299')
      .row()

    kb.text('НАЗАД К ПОЖЕРТВОВАНИЮ', packCb({ a: 'open', s: 'about_payment' })).row()

  }

  kb.text('НА ГЛАВНУЮ', packCb({ a: 'home' })).icon('5465226866321268133')

  return {
    photo: './public/about-payment.png',
    caption: `*О ДОБРОВОЛЬНОМ ПОЖЕРТВОВАНИИ*\n\n${PAGES[page - 1]}\n\n`,
    keyboard: kb,
  }
}
