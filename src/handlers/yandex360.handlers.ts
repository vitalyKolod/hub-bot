import { goTo } from '../state/ui.js'
import { renderScreen } from '../core/render.js'
import { showAdminPanelMenu } from './adminPanel.handlers.js'
import { InlineKeyboard } from 'grammy'
import { Yandex360MemberModel, Yandex360RequestModel, Yandex360StreamModel } from '../models/Yandex360.js'
import { UserModel } from '../models/User.js'
import { hasAdminPermission } from '../services/adminAccess.service.js'
import { createMember, createStream, decideEmail, linkMember, requestEmail, updateMember, updateStream, validTelegramId, addAdminEmail, setAdminEmailStatus, getMyMembership, assignKnownUserToStream } from '../services/yandex360.service.js'

const YANDEX_ICON = '5310051278464778081'
const date = (v: any) => v ? new Date(v).toLocaleDateString('ru-RU', { timeZone: 'UTC' }) : '—'
const status: Record<string,string> = { pending:'⏳ Ожидает проверки', connected:'✅ Подключён', rejected:'❌ Отклонён', disconnected:'🚫 Отключён' }
async function show(ctx: any, message: string, kb: InlineKeyboard) {
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id
  const target = ctx.callbackQuery?.message?.message_id || ctx.session?.y360MessageId
  if (chatId && target) {
    try {
      await ctx.api.editMessageText(chatId, target, message, { reply_markup: kb, link_preview_options: { is_disabled: true } })
      ctx.session.y360MessageId = target
      return
    } catch (error) {
      if (String(error).includes('message is not modified')) return
    }
  }
  const sent = await ctx.reply(message, { reply_markup: kb })
  ctx.session.y360MessageId = sent.message_id
}

async function adminStreams(ctx: any) {
  const streams = await Yandex360StreamModel.find().sort({ name: 1 }).limit(50)
  const kb = new InlineKeyboard()
  const counts = await Promise.all(streams.map(stream => Yandex360MemberModel.find({ streamId: stream._id }).select('seats').lean()))
  for (const [index, stream] of streams.entries()) {
    const occupied = counts[index].reduce((sum, member) => sum + member.seats, 0)
    const label = `${stream.status === 'active' ? '🟢' : '🔴'} Поток ${stream.name} · ${counts[index].length} чел. · ${occupied}${stream.capacity ? `/${stream.capacity}` : ''} мест`
    kb.text(label.slice(0, 64), `y360:s:${stream._id}`).icon(YANDEX_ICON).row()
  }
  kb.text('➕ Новый поток', 'y360:newstream').row()
  kb.text('📋 Заявки на поток', 'y360:queue').row()
  kb.text('‹ Меню', 'y360:adminhome')
  await show(ctx, streams.length ? 'Потоки Яндекс 360:' : 'Потоков Яндекс 360 пока нет.', kb)
}

async function chooseStreamForUser(ctx: any, telegramId: number) {
  if (!validTelegramId(telegramId)) throw new Error('Некорректный Telegram ID')
  const user = await UserModel.findOne({ telegramId })
  if (!user) throw new Error('Пользователь HUB не найден')
  const existing = await Yandex360MemberModel.findOne({
    $or: [{ telegramId }, { userId: user._id }],
  })
  const kb = new InlineKeyboard()
  const identity = user.fio || user.username || String(telegramId)
  if (existing) {
    const stream = await Yandex360StreamModel.findById(existing.streamId)
    kb.text('👤 Открыть запись участника', `y360:m:${existing._id}`).row()
    kb.text('‹ К пользователю', `ap:u:${telegramId}`)
    await show(ctx, `Яндекс 360 · ${identity}\nTelegram ID: ${telegramId}\n\nУже назначен в поток ${stream?.name || 'не найден'}. Повторное назначение не требуется. Для переноса используйте карточку участника.`, kb)
    return
  }

  const streams = await Yandex360StreamModel.find({ status: 'active' }).sort({ name: 1 }).limit(50)
  let available = 0
  for (const stream of streams) {
    const members = await Yandex360MemberModel.find({ streamId: stream._id }).select('seats').lean()
    const occupied = members.reduce((sum, member) => sum + member.seats, 0)
    if (stream.capacity && occupied >= stream.capacity) continue
    kb.text(`Поток ${stream.name} · ${occupied}${stream.capacity ? `/${stream.capacity}` : ''} мест`.slice(0, 60),
      `y360:assign:${telegramId}:${stream._id}`).icon(YANDEX_ICON).row()
    available++
  }
  kb.text('‹ К пользователю', `ap:u:${telegramId}`)
  await show(ctx, `Яндекс 360 · ${identity}\nTelegram ID: ${telegramId}\n\n${available ? 'Выберите поток для назначения:' : 'Доступных потоков нет.'}`, kb)
}

async function confirmStreamForUser(ctx: any, telegramId: number, streamId: string) {
  if (!validTelegramId(telegramId)) throw new Error('Некорректный Telegram ID')
  const [user, stream] = await Promise.all([
    UserModel.findOne({ telegramId }), Yandex360StreamModel.findById(streamId),
  ])
  if (!user || !stream) throw new Error('Пользователь или поток не найден')
  const kb = new InlineKeyboard()
    .text('✅ Добавить в поток', `y360:assignconfirm:${telegramId}:${streamId}`).row()
    .text('‹ Выбрать другой поток', `y360:user:${telegramId}`)
  await show(ctx, `Добавить пользователя ${user.fio || user.username || telegramId} (ID ${telegramId}) в поток Яндекс 360 «${stream.name}»?`, kb)
}

async function adminStream(ctx: any, id: string) {
  const stream = await Yandex360StreamModel.findById(id)
  if (!stream) throw new Error('Поток не найден')
  const members = await Yandex360MemberModel.find({ streamId: stream._id })
  const occupied = members.reduce((sum, member) => sum + member.seats, 0)
  const kb = new InlineKeyboard()
    .text('👥 Участники потока', `y360:members:${id}`).row()
    .text('➕ Добавить участника', `y360:newmember:${id}`).row()
    .text('⚙️ Настройки потока', `y360:settings:${id}`).row()
    .text('‹ К списку потоков', 'y360:admin')
  await show(ctx, `📡 Поток ${stream.name}
Дата окончания: ${date(stream.endsAt)}
Статус: ${stream.status === 'active' ? '🟢 Открыт' : '🔴 Закрыт'}
Участников: ${members.length}
Занято мест: ${occupied}${stream.capacity ? ` из ${stream.capacity}` : ''}
Чат: ${stream.chatLink || '—'}\n\nСоздание потока не назначает подписку. Добавьте участника с его Telegram ID.`, kb)
}

async function streamMembers(ctx: any, id: string) {
  const stream = await Yandex360StreamModel.findById(id)
  if (!stream) throw new Error('Поток не найден')
  const members = await Yandex360MemberModel.find({ streamId: id }).sort({ name: 1 }).limit(50)
  const kb = new InlineKeyboard()
  for (const member of members) kb.text(`👤 ${member.name}`, `y360:m:${member._id}`).row()
  kb.text('➕ Добавить участника', `y360:newmember:${id}`).row()
  kb.text('🔎 Найти участника', `y360:search:${id}`).row()
  kb.text('‹ К потоку', `y360:s:${id}`)
  await show(ctx, `Участники потока ${stream.name}: ${members.length}`, kb)
}

async function streamSettings(ctx: any, id: string) {
  const stream = await Yandex360StreamModel.findById(id)
  if (!stream) throw new Error('Поток не найден')
  const kb = new InlineKeyboard()
  for (const [field, label] of [
    ['name', 'Название'], ['endsAt', 'Дата окончания'],
    ['chatLink', 'Ссылка на чат'], ['capacity', 'Количество мест'],
    ['adminEmail', 'Почта администратора'], ['amount', 'Сумма'],
  ]) kb.text(`✏️ ${label}`, `y360:editstream:${id}:${field}`).row()
  kb.text('🔘 Статус потока', `y360:statusmenu:${id}`).row()
  kb.text('‹ К потоку', `y360:s:${id}`)
  await show(ctx, `Настройки потока ${stream.name}
Окончание: ${date(stream.endsAt)}
Статус: ${stream.status === 'active' ? 'Активен' : 'Неактивен'}
Мест: ${stream.capacity || '—'}
Чат: ${stream.chatLink || '—'}
Почта администратора: ${stream.adminEmail || '—'}
Сумма: ${stream.amount ?? '—'}`, kb)
}

async function streamStatusMenu(ctx: any, id: string) {
  const stream = await Yandex360StreamModel.findById(id)
  if (!stream) throw new Error('Поток не найден')
  const kb = new InlineKeyboard()
    .text(`${stream.status === 'active' ? '✅ ' : ''}Активен`, `y360:status:${id}:active`).row()
    .text(`${stream.status === 'closed' ? '✅ ' : ''}Неактивен`, `y360:status:${id}:closed`).row()
    .text('‹ К настройкам', `y360:settings:${id}`)
  await show(ctx, `Статус потока ${stream.name}\n\nВыберите состояние кнопкой. Это не назначает подписку участнику: его нужно добавить отдельно по Telegram ID.`, kb)
}

async function adminMember(ctx: any, id: string) {
  const member = await Yandex360MemberModel.findById(id)
  if (!member) throw new Error('Участник не найден')
  const kb = new InlineKeyboard()
  const requests = await Yandex360RequestModel.find({ memberId: member._id, status: 'pending' })
  for (const request of requests) kb.text('✅ Подтвердить заявку', `y360:decide:${request._id}:yes`).text('❌ Отклонить', `y360:decide:${request._id}:no`).row()
  for (const [field, label] of [
    ['name', 'Имя'], ['username', 'Username'], ['seats', 'Места'],
    ['amount', 'Сумма'], ['note', 'Примечание'], ['streamId', 'Перевести в поток'],
  ]) kb.text(`✏️ ${label}`, `y360:editmember:${id}:${field}`).row()
  if (!member.telegramId) kb.text('🔗 Привязать Telegram ID', `y360:link:${id}`).row()
  kb.text('➕ Добавить email', `y360:adminemail:${id}`).row()
  for (const email of member.emails) {
    if (email.status === 'pending' && !requests.some(request => request.proposedEmail === email.address)) {
      kb.text(`✅ Подтвердить ${email.address}`.slice(0, 60), `y360:ap:${id}:${email._id}`)
        .text('❌ Отклонить', `y360:re:${id}:${email._id}`).row()
    }
    if (email.status === 'connected') {
      kb.text(`✅ Подтверждено · ${email.address}`.slice(0, 60), `y360:es:${id}:${email._id}`).row()
      kb.text('🚫 Отключить email', `y360:de:${id}:${email._id}`).row()
    }
    if (email.status === 'rejected') kb.text(`❌ Отклонено · ${email.address}`.slice(0, 60), `y360:es:${id}:${email._id}`).row()
    if (email.status === 'disconnected') kb.text(`🚫 Отключён · ${email.address}`.slice(0, 60), `y360:es:${id}:${email._id}`).row()
  }
  kb.text('‹ К участникам', `y360:members:${member.streamId}`)
  await show(ctx, `Яндекс 360 · ${member.name}
Telegram ID: ${member.telegramId || '—'}
Username: ${member.username || '—'}
Места: ${member.seats}; сумма: ${member.amount ?? '—'}
Примечание: ${member.note || '—'}
Email:
${member.emails.map(email => `• ${email.address} — ${status[email.status]}`).join('\n') || '—'}`, kb)
}
const streamFieldLabel: Record<string, string> = {
  name: 'название', endsAt: 'дату окончания',
  chatLink: 'ссылку на чат', status: 'статус', capacity: 'количество мест',
  adminEmail: 'почту администратора', amount: 'сумму',
}
const memberFieldLabel: Record<string, string> = {
  name: 'имя', username: 'username', seats: 'количество мест',
  amount: 'сумму', note: 'примечание', streamId: 'ID другого потока',
}
function promptKeyboard(back: string) {
  return new InlineKeyboard().text('‹ Назад', back).row().text('✖️ Отмена', 'y360:admin')
}

export function formatYandex360EmailRequestNotification(input: {
  memberName: string; telegramId: number; streamName: string; email: string; oldEmail?: string
}) {
  return [
    '✉️ Яндекс 360 · заявка на email',
    '━━━━━━━━━━━━━━',
    `👤 Участник: ${input.memberName}`,
    `🆔 Telegram ID: ${input.telegramId}`,
    `👥 Поток: ${input.streamName}`,
    input.oldEmail ? `🔄 Замена: ${input.oldEmail}` : '➕ Новый адрес',
    `📧 Предложен: ${input.email}`,
    '⏳ Статус: ждёт проверки',
  ].join('\n')
}

export async function handleYandex360Callback(ctx: any, data: string): Promise<boolean> {
  if (!data.startsWith('y360:')) return false
  const [, action, id, field] = data.split(':')
  const adminActions = new Set(['admin', 's', 'members', 'settings', 'statusmenu', 'status', 'm', 'newstream', 'newmember', 'memberconfirm', 'membernoid', 'editstream', 'editmember', 'link', 'adminemail', 'approveemail', 'rejectemail', 'disableemail', 'ap', 're', 'de', 'es', 'decide', 'search', 'queue', 'request', 'adminhome', 'user', 'assign', 'assignconfirm'])
  const editActions = new Set(['status', 'newstream', 'newmember', 'memberconfirm', 'membernoid', 'editstream', 'editmember', 'link', 'adminemail', 'approveemail', 'rejectemail', 'disableemail', 'ap', 're', 'de', 'decide', 'user', 'assign', 'assignconfirm'])
  if (adminActions.has(action) && !(await hasAdminPermission(ctx.from.id, editActions.has(action) ? 'streams.edit' : 'streams.view'))) {
    await ctx.answerCallbackQuery({ text: 'Нет прав', show_alert: true })
    return true
  }
  try {
    if (!['memberconfirm', 'membernoid', 'newmember', 'editstream', 'editmember', 'link', 'adminemail', 'search', 'add', 'replace'].includes(action)) ctx.session.y360Input = undefined
    if (action === 'people') {
      if (ctx.chat?.type !== 'private') throw new Error('Список доступен только в личном чате')
      const membership = await getMyMembership(ctx.from.id)
      if (!membership?.stream || String(membership.stream._id) !== id) throw new Error('Нет доступа к потоку')
      const page = Math.max(0, Number.isSafeInteger(Number(field)) ? Number(field) : 0)
      const pageSize = 15
      const total = await Yandex360MemberModel.countDocuments({ streamId: id })
      const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
      const currentPage = Math.min(page, lastPage)
      const people = await Yandex360MemberModel.find({ streamId: id })
        .select({ name: 1, telegramId: 1 }).sort({ name: 1 })
        .skip(currentPage * pageSize).limit(pageSize).lean()
      const lines = people.map((person, index) =>
        `${currentPage * pageSize + index + 1}. ${String(person.name || 'Без имени').slice(0, 90)}${person.telegramId === ctx.from.id ? ' (вы)' : ''}`)
      const text = `👥 Участники потока ${membership.stream.name} (${total})\n\n${lines.join('\n') || 'Пока никого нет'}\n\nСтраница ${currentPage + 1}/${lastPage + 1}`
      const kb = new InlineKeyboard()
      if (currentPage > 0) kb.text('‹ Ранее', `y360:people:${id}:${currentPage - 1}`)
      if (currentPage < lastPage) kb.text('Далее ›', `y360:people:${id}:${currentPage + 1}`)
      if (currentPage > 0 || currentPage < lastPage) kb.row()
      kb.text('◀️ К Яндекс 360', 'y360:open')
      if (ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message &&
          ctx.callbackQuery.message.text?.startsWith('👥 Участники потока')) {
        await ctx.editMessageText(text, { reply_markup: kb })
      } else {
        await ctx.reply(text, { reply_markup: kb })
      }
    } else if (action === 'user') await chooseStreamForUser(ctx, Number(id))
    else if (action === 'assign') await confirmStreamForUser(ctx, Number(id), field)
    else if (action === 'assignconfirm') {
      const result = await assignKnownUserToStream(ctx.from.id, Number(id), field)
      const stream = await Yandex360StreamModel.findById(result.member.streamId)
      const kb = new InlineKeyboard()
        .text('👤 Открыть запись участника', `y360:m:${result.member._id}`).row()
        .text('‹ К пользователю', `ap:u:${id}`)
      await show(ctx, `${result.created ? '✅ Пользователь добавлен' : 'ℹ️ Пользователь уже был назначен'} в поток Яндекс 360 «${stream?.name || '—'}».\nTelegram ID: ${id}`, kb)
    } else if (action === 'open') {
      goTo(ctx.from.id, 'yandex360')
      await renderScreen(ctx, ctx.from.id, 'yandex360')
    } else if (action === 'admin') await adminStreams(ctx)
    else if (action === 'adminhome') {
      ctx.session.y360MessageId = undefined
      await showAdminPanelMenu(ctx)
    } else if (action === 's') await adminStream(ctx, id)
    else if (action === 'members') await streamMembers(ctx, id)
    else if (action === 'settings') await streamSettings(ctx, id)
    else if (action === 'statusmenu') await streamStatusMenu(ctx, id)
    else if (action === 'status') {
      if (field !== 'active' && field !== 'closed') throw new Error('Некорректный статус')
      await updateStream(ctx.from.id, id, 'status', field)
      await streamStatusMenu(ctx, id)
    }
    else if (action === 'm') await adminMember(ctx, id)
    else if (action === 'request') {
      const request = await Yandex360RequestModel.findById(id)
      if (!request) throw new Error('Заявка не найдена')
      await adminMember(ctx, String(request.memberId))
    } else if (action === 'queue') {
      const requests = await Yandex360RequestModel.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(30)
      const kb = new InlineKeyboard()
      for (const request of requests) kb.text('Заявка на email', `y360:request:${request._id}`).row()
      kb.text('‹ К потокам', 'y360:admin')
      await show(ctx, `Заявки на поток Яндекс 360: ${requests.length}`, kb)
    } else if (action === 'search') {
      ctx.session.y360Input = { mode: 'search', streamId: id }
      await show(ctx, 'Поиск участника потока\n\nВведите имя, Telegram ID, username или email.', promptKeyboard(`y360:members:${id}`))
    } else if (action === 'newstream') {
      ctx.session.y360Input = { mode: 'newstream' }
      await show(ctx, 'Новый поток\n\nВведите номер или название потока.', promptKeyboard('y360:admin'))
    } else if (action === 'newmember') {
      ctx.session.y360Input = { mode: 'newmember_name', streamId: id }
      await show(ctx, 'Добавление участника · шаг 1 из 3\n\nВведите имя участника.', promptKeyboard(`y360:members:${id}`))
    } else if (action === 'memberconfirm') {
      const draft = ctx.session.y360Input
      if (!draft || draft.mode !== 'newmember_confirm' || draft.streamId !== id) throw new Error('Черновик устарел. Начните добавление заново.')
      const member = await createMember(ctx.from.id, { name: draft.name, streamId: id, telegramId: draft.telegramId || null })
      ctx.session.y360Input = undefined
      await adminMember(ctx, String(member._id))
    } else if (action === 'membernoid') {
      const draft = ctx.session.y360Input
      if (!draft || draft.mode !== 'newmember_id' || draft.streamId !== id) throw new Error('Черновик устарел. Начните добавление заново.')
      draft.mode = 'newmember_confirm'
      draft.telegramId = null
      await show(ctx, `Добавить участника?\n\nИмя: ${draft.name}\nTelegram ID: пока неизвестен`, new InlineKeyboard().text('✅ Сохранить', `y360:memberconfirm:${id}`).row().text('‹ Назад', `y360:newmember:${id}`).row().text('✖️ Отмена', `y360:members:${id}`))
    } else if (action === 'editstream') {
      if (!(field in streamFieldLabel)) throw new Error('Неизвестное поле')
      if (field === 'status') { await streamStatusMenu(ctx, id); await ctx.answerCallbackQuery().catch(() => {}); return true }
      ctx.session.y360Input = { mode: 'editstream', id, field }
      const hint = field === 'endsAt' ? 'Формат: ДД.ММ.ГГГГ, например 28.09.2026. «-» — очистить дату.' : ''
      await show(ctx, `Изменить ${streamFieldLabel[field]} потока\n\n${hint}`.trim(), promptKeyboard(`y360:settings:${id}`))
    } else if (action === 'editmember' || action === 'link' || action === 'adminemail') {
      if (action === 'editmember' && !(field in memberFieldLabel)) throw new Error('Неизвестное поле')
      ctx.session.y360Input = { mode: action, id, field }
      const label = action === 'link' ? 'Telegram ID' : action === 'adminemail' ? 'новый email' : memberFieldLabel[field]
      await show(ctx, `Введите ${label} участника.`, promptKeyboard(`y360:m:${id}`))
    } else if (action === 'add' || action === 'replace') {
      ctx.session.y360Input = { mode: 'email', oldEmailId: action === 'replace' ? id : undefined }
      await ctx.reply('Отправьте email для проверки. /cancel — отмена.')
    } else if (['approveemail', 'rejectemail', 'disableemail', 'ap', 're', 'de'].includes(action)) {
      const choice = action === 'approveemail' || action === 'ap' ? 'approve'
        : action === 'rejectemail' || action === 're' ? 'reject' : 'disable'
      const result = await setAdminEmailStatus(ctx.from.id, id, field, choice)
      if (result.changed && result.member.telegramId) await ctx.api.sendMessage(result.member.telegramId, `Яндекс 360: статус email изменён на ${choice === 'approve' ? 'подключён' : choice === 'reject' ? 'отклонён' : 'отключён'}.`).catch(() => {})
      await adminMember(ctx, id)
    } else if (action === 'es') {
      const member = await Yandex360MemberModel.findById(id)
      const email = member?.emails.id(field)
      await ctx.answerCallbackQuery({ text: email ? status[email.status] : 'Email не найден' })
      return true
    } else if (action === 'decide') {
      if (!(await hasAdminPermission(ctx.from.id, 'requests.edit'))) throw new Error('Нет прав на заявки')
      const result = await decideEmail(ctx.from.id, id, field === 'yes')
      if (result.changed && result.member?.telegramId) await ctx.api.sendMessage(result.member.telegramId, field === 'yes' ? 'Яндекс 360: email подтверждён.' : 'Яндекс 360: email отклонён.').catch(() => {})
      if (result.member) await adminMember(ctx, String(result.member._id))
      await ctx.answerCallbackQuery({ text: result.changed ? 'Решение сохранено' : 'Уже рассмотрено' })
      return true
    }
    await ctx.answerCallbackQuery().catch(() => {})
  } catch (error) {
    await ctx.answerCallbackQuery({ text: error instanceof Error ? error.message : 'Ошибка', show_alert: true }).catch(() => {})
  }
  return true
}

export async function handleYandex360Text(ctx: any): Promise<boolean> {
  const input = ctx.session.y360Input
  if (!input || ctx.chat?.type !== 'private') return false
  // Любой текст, введённый в сценарии Яндекс 360, служит значением формы,
  // поэтому убираем его из чата независимо от результата валидации.
  await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {})
  if (ctx.message.text === '/cancel') {
    ctx.session.y360Input = undefined
    await ctx.reply('Отменено')
    return true
  }
  try {
    const text = ctx.message.text.trim()
    if (input.mode === 'email') {
      const request = await requestEmail(ctx.from.id, text, input.oldEmailId)
      ctx.session.y360Input = undefined
      const topic = Number(process.env.YANDEX360_THREAD_ID)
      const group = Number(process.env.ADMIN_GROUP_ID)
      let notified = false
      if (topic && group) {
        try {
          const member = await Yandex360MemberModel.findById(request.memberId)
          const stream = await Yandex360StreamModel.findById(request.streamId)
          const oldEmail = member?.emails.find((email: any) => String(email._id) === String(request.oldEmailId))?.address
          const keyboard = new InlineKeyboard()
            .text('📋 Открыть заявку', `y360:request:${request._id}`).row()
            .text('👥 Открыть поток', `y360:s:${request.streamId}`).row()
            .url('👤 Telegram-профиль', `tg://user?id=${ctx.from.id}`)
          await ctx.api.sendMessage(group, formatYandex360EmailRequestNotification({
            memberName: member?.name || 'Без имени', telegramId: ctx.from.id,
            streamName: stream?.name || 'Не найден', email: request.proposedEmail,
            oldEmail,
          }), { message_thread_id: topic, reply_markup: keyboard })
          notified = true
        } catch (error) {
          console.error(`Yandex 360 request ${request._id}: admin notification failed:`, error)
        }
      } else {
        console.error(`Yandex 360 request ${request._id}: ADMIN_GROUP_ID or YANDEX360_THREAD_ID is missing`)
      }
      await ctx.reply(notified
        ? '✅ Email отправлен на проверку. Подтверждённые адреса остаются активными.'
        : '✅ Заявка сохранена, но уведомление администраторам не доставлено. Заявка доступна им в разделе Яндекс 360.')
      return true
    }
    if (!(await hasAdminPermission(ctx.from.id, 'streams.edit'))) throw new Error('Нет прав')
    if (input.mode === 'search') {
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const criteria: any[] = [{ name: new RegExp(escaped, 'i') }, { username: new RegExp(escaped, 'i') }, { 'emails.address': new RegExp(escaped, 'i') }]
      if (validTelegramId(text)) criteria.push({ telegramId: Number(text) })
      const members = await Yandex360MemberModel.find({ streamId: input.streamId, $or: criteria }).limit(20)
      ctx.session.y360Input = undefined
      const kb = new InlineKeyboard()
      for (const member of members) kb.text(member.name, `y360:m:${member._id}`).row()
      kb.text('‹ К участникам', `y360:members:${input.streamId}`)
      await show(ctx, `Найдено: ${members.length}`, kb)
    } else if (input.mode === 'newstream') {
      const stream = await createStream(ctx.from.id, text)
      ctx.session.y360Input = undefined
      await adminStream(ctx, String(stream._id))
    } else if (input.mode === 'newmember_name') {
      if (!text) throw new Error('Введите имя участника')
      ctx.session.y360Input = { mode: 'newmember_id', streamId: input.streamId, name: text }
      await show(ctx, `Добавление участника · шаг 2 из 3\n\nИмя: ${text}\n\nВведите Telegram ID или нажмите «ID неизвестен».`, new InlineKeyboard().text('ID неизвестен', `y360:membernoid:${input.streamId}`).row().text('‹ Назад', `y360:newmember:${input.streamId}`).row().text('✖️ Отмена', `y360:members:${input.streamId}`))
    } else if (input.mode === 'newmember_id') {
      if (!validTelegramId(text)) throw new Error('Введите числовой Telegram ID или нажмите «ID неизвестен»')
      ctx.session.y360Input = { ...input, mode: 'newmember_confirm', telegramId: Number(text) }
      await show(ctx, `Добавление участника · шаг 3 из 3\n\nИмя: ${input.name}\nTelegram ID: ${text}\n\nСохранить запись?`, new InlineKeyboard().text('✅ Сохранить', `y360:memberconfirm:${input.streamId}`).row().text('‹ Назад', `y360:newmember:${input.streamId}`).row().text('✖️ Отмена', `y360:members:${input.streamId}`))
    } else if (input.mode === 'editstream') {
      await updateStream(ctx.from.id, input.id, input.field, text)
      ctx.session.y360Input = undefined
      await streamSettings(ctx, input.id)
    } else if (input.mode === 'editmember') {
      await updateMember(ctx.from.id, input.id, input.field, text)
      ctx.session.y360Input = undefined
      await adminMember(ctx, input.id)
    } else if (input.mode === 'link') {
      await linkMember(ctx.from.id, input.id, Number(text))
      ctx.session.y360Input = undefined
      await adminMember(ctx, input.id)
    } else if (input.mode === 'adminemail') {
      await addAdminEmail(ctx.from.id, input.id, text)
      ctx.session.y360Input = undefined
      await adminMember(ctx, input.id)
    }
  } catch (error) {
    ctx.session.y360Input = input
    await ctx.reply(`${error instanceof Error ? error.message : 'Ошибка'}\nПовторите ввод или /cancel.`)
  }
  return true
}
