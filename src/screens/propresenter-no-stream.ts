import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'

export function propresenterNoStreamScreen(
  userId: number,
  input: string | { teamId: string; step?: 'count' | 'confirm' | 'final'; deviceCount?: number }
): ScreenView {
  const {
    teamId,
    step = 'count',
    deviceCount,
  } = typeof input === 'string' ? { teamId: input } : input
  const kb = new InlineKeyboard()
  if (step === 'confirm' && deviceCount) {
    kb.text('✅ Да, продолжить', packCb({ a: 'prop_waitlist_count_yes', p: teamId })).row()
    kb.text('✏️ Нет, изменить количество', packCb({ a: 'prop_waitlist_count_no', p: teamId })).row()
  } else if (step === 'final' && deviceCount) {
    kb.text('✅ Да, подать заявку', packCb({ a: 'prop_no_stream_confirm', p: teamId })).row()
    kb.text('✏️ Изменить количество', packCb({ a: 'prop_waitlist_count_no', p: teamId })).row()
  }
  kb.text('◀️ Назад', packCb({ a: 'back' }))

  return {
    photo: './public/propres.jpg',
    caption:
      `*Заявка на новый поток*\n\n` +
      (step === 'confirm' && deviceCount
        ? `Вы планируете подключить *${deviceCount}* устройств. Всё верно?`
        : step === 'final' && deviceCount
          ? `Заявка на новый поток ProPresenter: *${deviceCount}* устройств.\n\nПосле подачи мы сообщим, когда поток будет открыт. Подать заявку?`
          : `Сколько устройств ваша команда планирует подключить к новому потоку?\n\n*ОТПРАВЬТЕ КОЛИЧЕСТВО ЦИФРОЙ*. Сообщение с числом бот удалит.`),
    keyboard: kb,
  }
}
