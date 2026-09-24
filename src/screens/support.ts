import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export const HELP_PHOTO = './public/help.jpg'

export function supportScreen(_userId: number): ScreenView {
  return {
    photo: HELP_PHOTO,
    caption: '🆘 ПОМОЩЬ\n\nЕсли появились вопросы по работе ХАБ КОМЬЮНИТИ, сложности с ботом или вы обнаружили ошибку — напишите нам.\n\nВыбирите раздел 👇',
    keyboard: new InlineKeyboard()
      .text('Написать в поддержку', 'support:start')
      .icon('5307746710682869587').row()
      .url('Написать разработчику', 'https://t.me/vitaly_kolodchenko')
      .icon('5818813162815753343').row()
      .text('◀️ Назад', packCb({ a: 'home' })),
  }
}
