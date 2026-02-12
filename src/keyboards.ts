// src/keyboards.ts
import { InlineKeyboard } from 'grammy'

// Обновлённый тип экранов
export type Screen =
  | 'main'
  | 'payment_method' // выбор способа оплаты
  | 'pay_card' // реквизиты карты
  | 'pay_crypto' // реквизиты крипты
  | 'contact_admin'
  | 'support'
  | 'faq'

// Функция возвращает данные для любого экрана
export function getScreenData(screen: Screen, days: number = EXAMPLE_DAYS) {
  let photoPath = './public/main-menu.png'
  let caption = ''
  let keyboard = new InlineKeyboard()

  const statusText = days > 0 ? `Осталось ${days} дней` : 'Подписка не активна'

  switch (screen) {
    case 'main':
      photoPath = './public/main-menu.png'
      caption = `
Личный кабинет

Ваша подписка: ProPresenter (годовая)
${statusText}
      `

      keyboard = new InlineKeyboard()
      if (days <= 0) {
        keyboard.text('Продлить подписку', 'payment_method').row()
      }
      keyboard.text('Связаться с админом', 'contact_admin').row()
      keyboard.text('Техподдержка', 'support').row()
      keyboard.text('Правила и FAQ', 'faq')
      break

    case 'payment_method':
      photoPath = './public/payment.png'
      caption = `
Продление подписки

Годовая подписка — 5000 ₽ (или эквивалент в крипте)

Выберите удобный способ оплаты:
      `
      keyboard = new InlineKeyboard()
        .text('Оплатить на карту', 'pay_card')
        .row()
        .text('Оплатить криптовалютой', 'pay_crypto')
        .row()
        .text('Назад в меню', 'back_to_main')
      break

    case 'pay_card':
      photoPath = './public/payment.png' // можно сделать отдельную картинку с картой
      caption = `
Оплата на карту

Сумма: 5000 ₽

Реквизиты:
Карта: 2200 1234 5678 9012
Получатель: Иван Иванов

После перевода пришлите скриншот чека.
Админ подтвердит в течение 30 минут.
      `
      keyboard = new InlineKeyboard()
        .text('Я оплатил (чек ниже)', 'uploaded_check')
        .row()
        .text('Назад к выбору', 'payment_method')
      break

    case 'pay_crypto':
      photoPath = './public/payment.png' // можно сделать с QR-кодом USDT
      caption = `
Оплата криптовалютой

Сумма: 5000 ₽ (~55 USDT по текущему курсу)

Кошелёк (TRC20 USDT):
Txxxxxxxxxxxxxxxxxxxxxxxxxxxx

После перевода пришлите TXID или скриншот транзакции.
Админ проверит и подтвердит.
      `
      keyboard = new InlineKeyboard()
        .text('Я оплатил (чек / TXID)', 'uploaded_check')
        .row()
        .text('Назад к выбору', 'payment_method')
      break

    case 'contact_admin':
      photoPath = './public/admin.png'
      caption = `
Связь с админом

Напишите ваше сообщение ниже (текст, фото, видео).
Я перешлю его админу в личку.
Чтобы отменить — /cancel
      `
      keyboard = new InlineKeyboard().text('Отменить и вернуться', 'back_to_main')
      break

    case 'support':
      photoPath = './public/support.png'
      caption = `
Техподдержка

Опишите проблему или вопрос ниже.
Я отвечу как можно скорее.
Чтобы отменить — /cancel
      `
      keyboard = new InlineKeyboard().text('Отменить и вернуться', 'back_to_main')
      break

    case 'faq':
      photoPath = './public/faq.png'
      caption = `
Правила и FAQ

1. Подписка на год — после оплаты 365 дней доступа к группе и контенту.
2. Напоминание об окончании придёт за 3–7 дней.
3. Оплата только на указанные реквизиты, чек обязателен.
4. Если не оплатили — бот предупредит, а потом может кикнуть из группы.
5. Вопросы по контенту — к админу, техпроблемы — в поддержку.

Если есть предложения по FAQ — пишите в поддержку!
      `
      keyboard = new InlineKeyboard().text('Назад в меню', 'back_to_main')
      break
  }

  return { photoPath, caption, keyboard }
}

// Константы
export const EXAMPLE_DAYS = 89
