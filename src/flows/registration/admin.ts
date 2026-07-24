import { InlineKeyboard } from 'grammy'

export function buildAdminKeyboard(user: any, userId: number) {
  const kb = new InlineKeyboard()

  if (user.subscriptions?.propresenter?.status === 'pending') {
    kb.text('Принять ProPresenter', `verify:prop:${userId}`)
      .icon('5237794483843655211')

      .text('Отклонить ProPresenter', `verify:reject_prop:${userId}`)
      .icon('5237755382461391050')

      .row()
  }

  if (user.subscriptions?.content?.status === 'pending') {
    kb.text(' Принять Контент', `verify:content:${userId}`)
      .icon('5237794483843655211')

      .text(' Отклонить Контент', `verify:reject_content:${userId}`)
      .icon('5237755382461391050')

      .row()
  }

  kb.text(' Отклонить всё', `verify:reject:${userId}`)
    .icon('5237755382461391050')

    .row()
    .url('Написать юзеру', `tg://user?id=${userId}`)

  return kb
}
