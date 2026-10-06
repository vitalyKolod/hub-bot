import { FormattedString } from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { Yandex360MemberModel } from '../models/Yandex360.js'
import { getMyMembership } from '../services/yandex360.service.js'
import { hasAdminPermission } from '../services/adminAccess.service.js'

const YANDEX_ICON = '5310051278464778081'
const MEMBERS_ICON = '5296533616224906961'
const MAX_VISIBLE_MEMBERS = 10

const emailStatus: Record<string, string> = {
  pending: '⏳ На проверке', connected: '✅ Подключён',
  rejected: '❌ Отклонён', disconnected: '🚫 Отключён',
}

export function formatYandex360DateTime(value: Date | null | undefined): string {
  if (!value) return 'не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'не указана'
  return `${date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })} МСК`
}

export function yandex360AccessState(stream: {
  status?: string; startsAt?: Date | null; endsAt?: Date | null
}, now = new Date()): { label: string; active: boolean; daysLeft: number | null } {
  const endsAt = stream.endsAt ? new Date(stream.endsAt) : null
  if (stream.status === 'closed') return { label: '🚫 Неактивен', active: false, daysLeft: null }
  if (endsAt && endsAt <= now) return { label: '❌ Срок закончился', active: false, daysLeft: 0 }
  return {
    label: '✅ Активен', active: true,
    daysLeft: endsAt ? Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000) : null,
  }
}

export async function yandex360Screen(userId: number): Promise<ScreenView> {
  const membership = await getMyMembership(userId)
  const kb = new InlineKeyboard()
  let message = new FormattedString('').emoji('🛜', YANDEX_ICON).plain(' ').bold('ЯНДЕКС 360')
    .plain('\n━━━━━━━━━━━━━━\n\n')

  if (!membership) {
    const canAssign = await hasAdminPermission(userId, 'streams.edit')
    message = message.bold('Подписка не назначена').plain('\n')
      .plain(canAssign
        ? 'Создание потока не добавляет участника автоматически. Добавьте свой Telegram ID в потоке через админку.'
        : 'Попросите администратора добавить вас в поток или напишите в поддержку.')
    if (canAssign) {
      message = message.plain('\nВаш Telegram ID: ').code(String(userId))
      kb.text('➕ Назначить участника в админке', 'y360:admin').row()
    }
  } else {
    const { member, stream } = membership
    if (!stream) {
      message = message.bold('Поток не найден').plain('\nОбратитесь к администратору или в поддержку.')
    } else {
      const state = yandex360AccessState(stream)
      const members = await Yandex360MemberModel.find({ streamId: stream._id })
        .select({ name: 1, telegramId: 1 }).sort({ name: 1 }).lean()
      const emails = member.emails.filter(email => email.status === 'connected' || email.status === 'pending')

      message = message.emoji('👥', MEMBERS_ICON).plain(' ').bold(`ПОТОК ${String(stream.name).slice(0, 45)}`)
        .plain('\n┗ Статус: ').bold(state.label)
        .plain('\n┗ До: ').code(formatYandex360DateTime(stream.endsAt))
      if (state.daysLeft !== null && state.active) {
        message = message.plain('\n┗ Осталось: ').bold(`${state.daysLeft} дн.`)
      }

      message = message.plain('\n\n').emoji('👥', MEMBERS_ICON)
        .plain(' ').bold(`УЧАСТНИКИ ПОТОКА (${members.length})`).plain('\n')
      for (const person of members.slice(0, MAX_VISIBLE_MEMBERS)) {
        const own = person.telegramId === userId ? ' (вы)' : ''
        message = message.plain(`┗ ${String(person.name || 'Без имени').slice(0, 28)}${own}\n`)
      }
      if (!members.length) message = message.plain('┗ Пока никого нет\n')
      if (members.length > MAX_VISIBLE_MEMBERS) {
        message = message.plain(`┗ И ещё ${members.length - MAX_VISIBLE_MEMBERS} чел.\n`)
      }

      message = message.plain('\n✉️ ').bold('МОИ EMAIL').plain('\n')
      if (emails.length) {
        for (const email of emails.slice(0, 3)) {
          message = message.plain(`┗ ${email.address.slice(0, 60)} — ${emailStatus[email.status]}\n`)
        }
        if (emails.length > 3) message = message.plain(`┗ И ещё ${emails.length - 3} адресов\n`)
      } else {
        message = message.plain('┗ Адресов пока нет\n')
      }

      if (state.active && stream.chatLink) {
        kb.url(`Чат потока ${stream.name}`.slice(0, 60), stream.chatLink).icon(YANDEX_ICON).row()
      }
      if (members.length > MAX_VISIBLE_MEMBERS) {
        kb.text('👥 Все участники потока', `y360:people:${stream._id}:0`).icon(MEMBERS_ICON).row()
      }
      const connectedEmails = member.emails.filter(email => email.status === 'connected')
      if (connectedEmails.length === 0) {
        kb.text('➕ Добавить свой email', 'y360:add').row()
      } else {
        for (const email of connectedEmails.slice(0, 5)) {
          const label = connectedEmails.length === 1 ? 'Заменить свой email' : `Заменить ${email.address}`
          kb.text(label.slice(0, 60), `y360:replace:${email._id}`).row()
        }
      }
    }
  }

  kb.text('Помощь', packCb({ a: 'open', s: 'support' })).icon('5238025132177369293').row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
  return {
    photo: './public/yandex360.png', caption: message.caption,
    caption_entities: message.caption_entities, keyboard: kb,
  }
}
