// handlers/adminPanel.handlers.ts
// Экраны и обработка callback/текста для админ-панели.
// Подключение — см. WIRING.md (несколько вставок в bot.ts).

import { InlineKeyboard, type Context } from 'grammy'
import { isAdmin } from '../config/admin.js'
import { getProduct } from '../config/products.js'
import {
  apCb,
  parseAdminPanelCallback,
  isAdminPanelCallback,
  statusLabel,
  statusDot,
  formatDate,
  getDaysLeft,
  TEAM_PRODUCT_IDS,
  PRODUCT_EMOJI,
  PAGE_SIZE,
} from '../constants/admin-panel.js'
import * as ap from '../services/adminPanel.service.js'
import { SUPPORT_GROUP_ID } from '../config/env.js'

// ---------- session helpers ----------

type ApInputMode =
  | 'search_user'
  | 'search_team'
  | 'edit_user_field'
  | 'add_user_to_team'
  | 'edit_team_name'
  | 'set_team_sub_date'
  | 'set_team_sub_meta'
  | 'add_team_member'
  | 'transfer_ownership'
  | 'stream_field'
  | 'stream_date'
  | 'stream_new'
  | 'add_team_to_stream'

type ApInput = {
  mode: ApInputMode
  telegramId?: number
  teamId?: string
  product?: string
  field?: string
  flowNumber?: number
  step?: string
  draft?: Record<string, any>
}

function getSession(ctx: Context): any {
  return (ctx as any).session
}

function isSupportTopic(ctx: Context): boolean {
  return ctx.chat?.id === SUPPORT_GROUP_ID && Boolean(ctx.message?.message_thread_id)
}

/** В поддержке не создаём отдельное сообщение «готово»: ставим реакцию и
 * удаляем служебный ввод администратора. В личной админке сохраняем старое поведение. */
async function confirmAdminInput(ctx: Context, text: string) {
  if (!isSupportTopic(ctx)) {
    await ctx.reply(text)
    return
  }
  await ctx.react('👍').catch(() => {})
  await ctx.deleteMessage().catch(() => {})
}

async function guard(ctx: Context): Promise<boolean> {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery?.({ text: 'Нет доступа' }).catch(() => {})
    return false
  }
  return true
}

function productName(id: string): string {
  return getProduct(id)?.name || id
}

function escapeMd(text: string): string {
  return String(text ?? '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

/** Рендерит экран: если есть callbackQuery — редактирует сообщение, иначе шлёт новое. */
async function render(ctx: Context, text: string, kb: InlineKeyboard, markdown = true) {
  const opts: any = { reply_markup: kb }
  if (markdown) opts.parse_mode = 'Markdown'
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts))
  } else {
    await ctx.reply(text, opts)
  }
}

function paginationRow(kb: InlineKeyboard, page: number, totalPages: number, base: string) {
  if (totalPages <= 1) return
  const row: [string, string][] = []
  if (page > 0) row.push(['‹ Пред.', apCb(base, page - 1)])
  row.push([`${page + 1}/${totalPages}`, apCb(base, page)]) // неактивная, просто индикатор
  if (page < totalPages - 1) row.push(['След. ›', apCb(base, page + 1)])
  for (const [label, cb] of row) kb.text(label, cb)
  kb.row()
}

// ==================== ГЛАВНОЕ МЕНЮ ====================

export async function showAdminPanelMenu(ctx: Context) {
  const kb = new InlineKeyboard()
    .text('👥 Юзеры', apCb('ul', 0))
    .text('🏘 Команды', apCb('tl', 0))
    .row()
    .text('📡 Потоки ProPresenter', apCb('streams'))

  await render(ctx, '🛠 *Панель управления*\n\nВыбери раздел.', kb)
}

// ==================== ЮЗЕРЫ: список / поиск ====================

async function showUserList(ctx: Context, page: number) {
  const { users, total, totalPages } = await ap.adminListUsers(page)

  const kb = new InlineKeyboard()
  kb.text('🔍 Поиск', apCb('search_u')).row()

  for (const u of users) {
    const label = `${u.fio || 'без имени'} · ${u.telegramId}`
    kb.text(label.slice(0, 60), apCb('u', u.telegramId)).row()
  }

  paginationRow(kb, page, totalPages, 'ul')
  kb.text('‹ Меню', apCb('menu'))

  const text = users.length
    ? `👥 Юзеры: ${total} всего (стр. ${page + 1}/${totalPages}, по ${PAGE_SIZE} на странице)`
    : 'Юзеров пока нет.'
  await render(ctx, text, kb, false)
}

async function promptSearchUsers(ctx: Context) {
  getSession(ctx).adminPanelInput = { mode: 'search_user' } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('ul', 0))
  await render(ctx, 'Введи telegram ID, @username или ФИО:', kb, false)
}

async function runUserSearch(ctx: Context, query: string) {
  const users = await ap.adminSearchUsers(query)
  if (users.length === 0) {
    await ctx.reply('Ничего не найдено.')
    return
  }
  const kb = new InlineKeyboard()
  for (const u of users) {
    const label = `${u.fio || 'без имени'} · ${u.telegramId}`
    kb.text(label.slice(0, 60), apCb('u', u.telegramId)).row()
  }
  kb.text('‹ Меню', apCb('menu'))
  await ctx.reply(`Найдено: ${users.length}`, { reply_markup: kb })
}

// ==================== КАРТОЧКА ЮЗЕРА ====================

async function showUserCard(ctx: Context, telegramId: number) {
  const user = await ap.adminGetUser(telegramId)
  if (!user) {
    await render(ctx, 'Пользователь не найден', new InlineKeyboard().text('‹ Меню', apCb('menu')))
    return
  }

  const teams = await ap.adminGetTeamsForUser(telegramId)
  const teamsText = teams.length
    ? teams.map((t) => `• ${escapeMd(t.name)}${t.ownerId === telegramId ? ' 👑' : ''}`).join('\n')
    : '—'

  const text =
    `👤 *${escapeMd(user.fio || 'без имени')}*\n` +
    `ID: \`${user.telegramId}\`\n` +
    `Username: ${user.username ? '@' + escapeMd(user.username) : '—'}\n` +
    `Город: ${escapeMd(user.city || '—')}\n` +
    `Церковь: ${escapeMd(user.church || '—')}\n` +
    `Регистрация: ${user.reg}\n\n` +
    `*Команды:*\n${teamsText}`

  const kb = new InlineKeyboard()
    .text('✏️ ФИО', apCb('u', telegramId, 'edit', 'fio'))
    .text('✏️ Город', apCb('u', telegramId, 'edit', 'city'))
    .row()
    .text('✏️ Церковь', apCb('u', telegramId, 'edit', 'church'))
    .row()

  for (const t of teams) {
    kb.text(`👥 ${t.name}`, apCb('t', t._id.toString())).row()
  }

  kb.text('➕ Добавить в команду', apCb('u', telegramId, 'addteam')).row()
  if (teams.length) {
    kb.text('➖ Убрать из команды', apCb('u', telegramId, 'rmteam_menu')).row()
  }
  kb.text('‹ К списку', apCb('ul', 0))

  await render(ctx, text, kb)
}

/** Открывает карточку пользователя новым сообщением — используется из топика поддержки. */
export async function showAdminUserCard(ctx: Context, telegramId: number) {
  await showUserCard(replyOnlyCtx(ctx), telegramId)
}

async function promptEditUserField(ctx: Context, telegramId: number, field: string) {
  getSession(ctx).adminPanelInput = { mode: 'edit_user_field', telegramId, field } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('u', telegramId))
  await render(ctx, `Введи новое значение для "${field}":`, kb, false)
}

async function promptAddUserToTeam(ctx: Context, telegramId: number) {
  getSession(ctx).adminPanelInput = { mode: 'add_user_to_team', telegramId } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('u', telegramId))
  await render(ctx, 'Введи название команды для поиска:', kb, false)
}

async function showRemoveUserFromTeamMenu(ctx: Context, telegramId: number) {
  const teams = await ap.adminGetTeamsForUser(telegramId)
  const kb = new InlineKeyboard()
  for (const t of teams) {
    kb.text(`❌ ${t.name}`, apCb('u', telegramId, 'rmteam', t._id.toString())).row()
  }
  kb.text('‹ Назад', apCb('u', telegramId))
  await render(ctx, 'Из какой команды убрать?', kb, false)
}

// ==================== КОМАНДЫ: список / поиск ====================

async function showTeamList(ctx: Context, page: number) {
  const { teams, total, totalPages } = await ap.adminListTeams(page)

  const kb = new InlineKeyboard()
  kb.text('🔍 Поиск', apCb('search_t')).row()

  for (const t of teams) {
    kb.text(`${t.name} · ${t.members.length}👤`.slice(0, 60), apCb('t', t._id.toString())).row()
  }

  paginationRow(kb, page, totalPages, 'tl')
  kb.text('‹ Меню', apCb('menu'))

  const text = teams.length
    ? `🏘 Команды: ${total} всего (стр. ${page + 1}/${totalPages}, по ${PAGE_SIZE} на странице)`
    : 'Команд пока нет.'
  await render(ctx, text, kb, false)
}

async function promptSearchTeams(ctx: Context) {
  getSession(ctx).adminPanelInput = { mode: 'search_team' } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('tl', 0))
  await render(ctx, 'Введи название команды или telegram ID владельца:', kb, false)
}

async function runTeamSearch(ctx: Context, query: string) {
  const teams = await ap.adminSearchTeams(query)
  if (teams.length === 0) {
    await ctx.reply('Ничего не найдено.')
    return
  }
  const kb = new InlineKeyboard()
  for (const t of teams) {
    kb.text(`${t.name} · ${t.members.length}👤`.slice(0, 60), apCb('t', t._id.toString())).row()
  }
  kb.text('‹ Меню', apCb('menu'))
  await ctx.reply(`Найдено: ${teams.length}`, { reply_markup: kb })
}

// ==================== КАРТОЧКА КОМАНДЫ (как у юзеров + админ-блок) ====================

async function showTeamCard(ctx: Context, teamId: string) {
  const team = await ap.adminGetTeam(teamId)
  if (!team) {
    await render(ctx, 'Команда не найдена', new InlineKeyboard().text('‹ Меню', apCb('menu')))
    return
  }

  const owner = await ap.adminGetUser(team.ownerId)

  let text = `👥 *${escapeMd(team.name)}*\n`
  text += `👑 Владелец: ${escapeMd(owner?.fio || 'не найден')} (\`${team.ownerId}\`)\n`
  text += `💬 Username: ${owner?.username ? `@${escapeMd(owner.username)}` : 'нет'}\n`
  text += `━━━━━━━━━━━━━━\n*Подписки:*\n\n`

  for (const productId of TEAM_PRODUCT_IDS) {
    const sub: any = team.subscriptions.get(productId)
    const emoji = PRODUCT_EMOJI[productId] || '📦'
    text += `${emoji} *${escapeMd(productName(productId))}*\n`
    text += `┗ Статус: ${statusLabel(sub?.status)}\n`

    if (sub?.status === 'active') {
      text += `┗ Осталось: ${getDaysLeft(sub.expiresAt)} дн. (до ${formatDate(sub.expiresAt)})\n`
    }

    if (productId === 'propresenter' && sub?.meta) {
      if (sub.meta.flowNumber) text += `┗ Поток: №${sub.meta.flowNumber}\n`
      if (sub.meta.email) text += `┗ Логин: \`${escapeMd(sub.meta.email)}\`\n`
      if (sub.meta.password) text += `┗ Пароль: \`${escapeMd(sub.meta.password)}\`\n`
      if (sub.meta.chatLink) text += `┗ Чат: есть\n`
    }
    text += '\n'
  }

  text += `━━━━━━━━━━━━━━\n*Состав (${team.members.length}/5):*\n`
  for (const m of team.members) {
    const mu = await ap.adminGetUser(m.telegramId)
    const role = m.telegramId === team.ownerId ? '👑' : '👤'
    const username = mu?.username ? `@${escapeMd(mu.username)}` : 'нет'
    text += `${role} ${escapeMd(mu?.fio || 'без имени')} · \`${m.telegramId}\` · username: ${username}\n`
  }

  // ---- клавиатура ----
  const kb = new InlineKeyboard()

  for (const productId of TEAM_PRODUCT_IDS) {
    const sub: any = team.subscriptions.get(productId)
    const dot = statusDot(sub?.status)
    kb.text(`${dot} ${productName(productId)}`, apCb('t', teamId, productId)).row()
  }

  kb.text('➕ Добавить участника', apCb('t', teamId, 'mem', 'add'))
  kb.text('➖ Удалить участника', apCb('t', teamId, 'mem', 'rmmenu'))
  kb.row()
  kb.text('👑 Передать владение', apCb('t', teamId, 'owner'))
  kb.text('✏️ Название', apCb('t', teamId, 'edit', 'name'))
  kb.row()
  kb.url('✉️ Написать владельцу', `tg://user?id=${team.ownerId}`).row()
  kb.text('‹ К списку', apCb('tl', 0))

  await render(ctx, text, kb)
}

/** Открывает карточку команды новым сообщением — используется из топика поддержки. */
export async function showAdminTeamCard(ctx: Context, teamId: string) {
  await showTeamCard(replyOnlyCtx(ctx), teamId)
}

async function promptEditTeamName(ctx: Context, teamId: string) {
  getSession(ctx).adminPanelInput = { mode: 'edit_team_name', teamId } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('t', teamId))
  await render(ctx, 'Введи новое название команды:', kb, false)
}

async function promptTransferOwnership(ctx: Context, teamId: string) {
  getSession(ctx).adminPanelInput = { mode: 'transfer_ownership', teamId } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('t', teamId))
  await render(
    ctx,
    'Введи telegram ID нового владельца (если он не в команде — добавится автоматически):',
    kb,
    false
  )
}

async function promptAddTeamMember(ctx: Context, teamId: string) {
  getSession(ctx).adminPanelInput = { mode: 'add_team_member', teamId } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('t', teamId))
  await render(ctx, 'Введи telegram ID пользователя для добавления в команду:', kb, false)
}

async function showRemoveMemberMenu(ctx: Context, teamId: string) {
  const team = await ap.adminGetTeam(teamId)
  if (!team) return
  const kb = new InlineKeyboard()
  for (const m of team.members) {
    if (m.telegramId === team.ownerId) continue // владельца тут не удаляем
    const mu = await ap.adminGetUser(m.telegramId)
    kb.text(`❌ ${mu?.fio || m.telegramId}`, apCb('t', teamId, 'mem', 'rm', m.telegramId)).row()
  }
  kb.text('‹ Назад', apCb('t', teamId))
  await render(ctx, 'Кого удалить из команды?', kb, false)
}

// ==================== ПОДПИСКА КОМАНДЫ (карточка продукта) ====================

async function showTeamProductCard(ctx: Context, teamId: string, product: string) {
  const team = await ap.adminGetTeam(teamId)
  const sub: any = team?.subscriptions.get(product)

  let text = `${PRODUCT_EMOJI[product] || '📦'} *${escapeMd(productName(product))}* — команда\n\n`
  text += `Статус: ${statusLabel(sub?.status)}\n`
  text += `Действует до: ${formatDate(sub?.expiresAt)}\n`

  if (product === 'propresenter') {
    text += `Поток: ${sub?.meta?.flowNumber ? '№' + sub.meta.flowNumber : '—'}\n`
    text += `Логин: \`${escapeMd(sub?.meta?.email || '—')}\`\n`
    text += `Пароль: \`${escapeMd(sub?.meta?.password || '—')}\`\n`
    text += `Ссылка на чат: ${sub?.meta?.chatLink ? 'задана' : '—'}\n`
  }

  const kb = new InlineKeyboard()

  kb.text(
    sub?.status === 'active' ? '🔁 Продлить ещё на 1 год' : '➕ Добавить подписку (на 1 год)',
    apCb('t', teamId, product, 'ex')
  ).row()
  kb.text('📅 Изменить дату окончания', apCb('t', teamId, product, 'dt')).row()

  if (product === 'propresenter') {
    kb.text('✏️ Поток', apCb('t', teamId, product, 'f', 'flowNumber'))
    kb.text('✏️ Логин', apCb('t', teamId, product, 'f', 'email'))
    kb.row()
    kb.text('✏️ Пароль', apCb('t', teamId, product, 'f', 'password'))
    kb.text('✏️ Ссылка на чат', apCb('t', teamId, product, 'f', 'chatLink'))
    kb.row()
  }

  kb.text('⏳ Отметить "на проверке"', apCb('t', teamId, product, 'st', 'pending'))
  kb.text('🚫 Отклонить', apCb('t', teamId, product, 'st', 'rejected'))
  kb.row()
  kb.text('♻️ Сбросить (нет подписки)', apCb('t', teamId, product, 'rs')).row()
  kb.text('‹ К команде', apCb('t', teamId))

  await render(ctx, text, kb)
}

async function promptSetTeamSubDate(ctx: Context, teamId: string, product: string) {
  getSession(ctx).adminPanelInput = { mode: 'set_team_sub_date', teamId, product } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('t', teamId, product))
  await render(ctx, 'Введи дату в формате ДД.ММ.ГГГГ (или "-" чтобы очистить):', kb, false)
}

async function promptSetTeamSubMetaField(
  ctx: Context,
  teamId: string,
  product: string,
  field: string
) {
  getSession(ctx).adminPanelInput = {
    mode: 'set_team_sub_meta',
    teamId,
    product,
    field,
  } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('t', teamId, product))
  await render(ctx, `Введи новое значение для "${field}":`, kb, false)
}

// ==================== ПОТОКИ PROPRESENTER (справочник, не привязан к юзеру) ====================

async function showStreamsList(ctx: Context) {
  const streams = await ap.adminGetAllStreams()
  const kb = new InlineKeyboard()
  for (const s of streams) {
    const mark = s.status === 'active' ? '🟢' : '🔴'
    const occ = await ap.adminGetStreamOccupancy(s.flowNumber)
    kb.text(
      `${mark} Поток #${s.flowNumber} · ${occ}/${s.capacity}👥`,
      apCb('stream', s.flowNumber)
    ).row()
  }
  kb.text('➕ Новый поток', apCb('stream_new')).row()
  kb.text('‹ Меню', apCb('menu'))

  const text = streams.length ? 'Потоки ProPresenter (из БД):' : 'Потоков пока нет.'
  await render(ctx, text, kb, false)
}

async function showStreamCard(ctx: Context, flowNumber: number) {
  const s = await ap.adminGetStream(flowNumber)
  if (!s) {
    await render(ctx, 'Поток не найден', new InlineKeyboard().text('‹ Меню', apCb('menu')))
    return
  }

  const occupancy = await ap.adminGetStreamOccupancy(flowNumber)

  const text =
    `📡 *Поток #${s.flowNumber}*\n` +
    `Email: \`${escapeMd(s.email)}\`\n` +
    `Пароль: \`${escapeMd(s.password)}\`\n` +
    `Чат: ${s.chatLink || '—'}\n` +
    `Вместимость: ${occupancy}/${s.capacity}\n` +
    `Действует до: ${formatDate(s.expiresAt)}\n` +
    `Статус: ${s.status === 'active' ? '🟢 active' : '🔴 closed'}`

  const kb = new InlineKeyboard()
    .text('✏️ Email', apCb('stream', flowNumber, 'edit', 'email'))
    .text('✏️ Пароль', apCb('stream', flowNumber, 'edit', 'password'))
    .row()
    .text('✏️ Ссылка на чат', apCb('stream', flowNumber, 'edit', 'chatLink'))
    .row()
    .text('✏️ Вместимость', apCb('stream', flowNumber, 'edit', 'capacity'))
    .text('📅 Дата окончания', apCb('stream', flowNumber, 'date'))
    .row()
    .text(
      s.status === 'active' ? '🔴 Закрыть поток' : '🟢 Открыть поток',
      apCb('stream', flowNumber, 'toggle')
    )
    .row()
    .text('👥 Команды в потоке', apCb('stream', flowNumber, 'teams'))
    .row()
    .text('🗑 Удалить поток', apCb('stream', flowNumber, 'delete'))
    .row()
    .text('‹ К списку потоков', apCb('streams'))

  await render(ctx, text, kb)
}

async function promptEditStreamField(ctx: Context, flowNumber: number, field: string) {
  getSession(ctx).adminPanelInput = { mode: 'stream_field', flowNumber, field } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('stream', flowNumber))
  await render(ctx, `Введи новое значение для "${field}":`, kb, false)
}

async function promptSetStreamDate(ctx: Context, flowNumber: number) {
  getSession(ctx).adminPanelInput = { mode: 'stream_date', flowNumber } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('stream', flowNumber))
  await render(
    ctx,
    'Введи дату окончания потока в формате ДД.ММ.ГГГГ (или "-" чтобы очистить):',
    kb,
    false
  )
}

async function showDeleteStreamConfirm(ctx: Context, flowNumber: number) {
  const kb = new InlineKeyboard()
    .text('✅ Да, удалить', apCb('stream', flowNumber, 'delete_confirm'))
    .row()
    .text('‹ Отмена', apCb('stream', flowNumber))
  await render(
    ctx,
    `Удалить поток #${flowNumber}? Действие необратимо.\n\nКоманды, которые уже сидят в этом потоке, не отвяжутся автоматически — их подписку потом нужно будет поправить вручную.`,
    kb,
    false
  )
}

async function showStreamTeamsMenu(ctx: Context, flowNumber: number) {
  const stream = await ap.adminGetStream(flowNumber)
  const teams = await ap.adminGetTeamsInStream(flowNumber)

  const kb = new InlineKeyboard()
  for (const t of teams) {
    const owner = await ap.adminGetUser(t.ownerId)
    const label = `❌ ${t.name} (${owner?.fio || t.ownerId})`
    kb.text(label.slice(0, 60), apCb('stream', flowNumber, 'rmteam', t._id.toString())).row()
  }
  kb.text('➕ Добавить команду в поток', apCb('stream', flowNumber, 'addteam')).row()
  kb.text('‹ К потоку', apCb('stream', flowNumber))

  const cap = stream?.capacity ?? 30
  const text = teams.length
    ? `👥 Команды в потоке #${flowNumber}: ${teams.length}/${cap}\n\nНажми на команду, чтобы убрать её из потока.`
    : `В потоке #${flowNumber} пока нет команд (0/${cap}).`

  await render(ctx, text, kb, false)
}

async function promptAddTeamToStream(ctx: Context, flowNumber: number) {
  getSession(ctx).adminPanelInput = { mode: 'add_team_to_stream', flowNumber } as ApInput
  const kb = new InlineKeyboard().text('‹ Назад', apCb('stream', flowNumber, 'teams'))
  await render(ctx, 'Введи название команды для поиска:', kb, false)
}

async function startNewStream(ctx: Context) {
  getSession(ctx).adminPanelInput = { mode: 'stream_new', step: 'email', draft: {} } as ApInput
  const kb = new InlineKeyboard().text('‹ Отмена', apCb('streams'))
  await render(ctx, 'Новый поток. Введи email:', kb, false)
}

// ==================== ДИСПЕТЧЕР CALLBACK'ОВ ====================

/** Вызывать первой строкой в bot.on('callback_query:data', ...). */
export async function handleAdminPanelCallback(ctx: Context, data: string): Promise<boolean> {
  if (!isAdminPanelCallback(data)) return false
  if (!(await guard(ctx))) return true

  const [scope, ...rest] = parseAdminPanelCallback(data)

  try {
    switch (scope) {
      case 'menu':
        await showAdminPanelMenu(ctx)
        break

      // ---- юзеры ----
      case 'ul':
        await showUserList(ctx, Number(rest[0] || 0))
        break
      case 'search_u':
        await promptSearchUsers(ctx)
        break
      case 'u': {
        const telegramId = Number(rest[0])
        const action = rest[1]
        if (!action) await showUserCard(ctx, telegramId)
        else if (action === 'edit') await promptEditUserField(ctx, telegramId, rest[2])
        else if (action === 'addteam') await promptAddUserToTeam(ctx, telegramId)
        else if (action === 'rmteam_menu') await showRemoveUserFromTeamMenu(ctx, telegramId)
        else if (action === 'rmteam') {
          await ap.adminRemoveTeamMember(rest[2], telegramId)
          await showUserCard(ctx, telegramId)
        } else if (action === 'addteam_pick') {
          await ap.adminAddTeamMember(rest[2], telegramId)
          await showUserCard(ctx, telegramId)
        }
        break
      }

      // ---- команды ----
      case 'tl':
        await showTeamList(ctx, Number(rest[0] || 0))
        break
      case 'search_t':
        await promptSearchTeams(ctx)
        break
      case 't': {
        const teamId = rest[0]
        const next = rest[1]

        if (!next) {
          await showTeamCard(ctx, teamId)
        } else if (next === 'edit') {
          await promptEditTeamName(ctx, teamId)
        } else if (next === 'owner') {
          await promptTransferOwnership(ctx, teamId)
        } else if (next === 'mem') {
          const memberAction = rest[2]
          if (memberAction === 'add') await promptAddTeamMember(ctx, teamId)
          else if (memberAction === 'rmmenu') await showRemoveMemberMenu(ctx, teamId)
          else if (memberAction === 'rm') {
            await ap.adminRemoveTeamMember(teamId, Number(rest[3]))
            await showTeamCard(ctx, teamId)
          }
        } else if ((TEAM_PRODUCT_IDS as readonly string[]).includes(next)) {
          const product = next
          const productAction = rest[2]
          if (!productAction) {
            await showTeamProductCard(ctx, teamId, product)
          } else if (productAction === 'st') {
            await ap.adminSetTeamSubStatus(teamId, product, rest[3])
            await showTeamProductCard(ctx, teamId, product)
          } else if (productAction === 'dt') {
            await promptSetTeamSubDate(ctx, teamId, product)
          } else if (productAction === 'ex') {
            await ap.adminExtendTeamSub(teamId, product)
            await showTeamProductCard(ctx, teamId, product)
          } else if (productAction === 'rs') {
            await ap.adminResetTeamSub(teamId, product)
            await showTeamProductCard(ctx, teamId, product)
          } else if (productAction === 'f') {
            await promptSetTeamSubMetaField(ctx, teamId, product, rest[3])
          }
        }
        break
      }

      // ---- потоки ----
      case 'streams':
        await showStreamsList(ctx)
        break
      case 'stream_new':
        await startNewStream(ctx)
        break
      case 'stream': {
        const flowNumber = Number(rest[0])
        const action = rest[1]
        if (!action) {
          await showStreamCard(ctx, flowNumber)
        } else if (action === 'edit') {
          await promptEditStreamField(ctx, flowNumber, rest[2])
        } else if (action === 'date') {
          await promptSetStreamDate(ctx, flowNumber)
        } else if (action === 'toggle') {
          const s = await ap.adminGetStream(flowNumber)
          await ap.adminUpdateStream(flowNumber, {
            status: s?.status === 'active' ? 'closed' : 'active',
          })
          await showStreamCard(ctx, flowNumber)
        } else if (action === 'teams') {
          await showStreamTeamsMenu(ctx, flowNumber)
        } else if (action === 'addteam') {
          await promptAddTeamToStream(ctx, flowNumber)
        } else if (action === 'addteam_pick') {
          await ap.adminAddTeamToStream(rest[2], flowNumber)
          await showStreamTeamsMenu(ctx, flowNumber)
        } else if (action === 'rmteam') {
          await ap.adminRemoveTeamFromStream(rest[2])
          await showStreamTeamsMenu(ctx, flowNumber)
        } else if (action === 'delete') {
          await showDeleteStreamConfirm(ctx, flowNumber)
        } else if (action === 'delete_confirm') {
          await ap.adminDeleteStream(flowNumber)
          await showStreamsList(ctx)
        }
        break
      }
    }
  } catch (err: any) {
    console.error('Admin panel error:', err)
    await ctx.answerCallbackQuery({ text: '❌ ' + (err.message || 'Ошибка') }).catch(() => {})
    return true
  }

  await ctx.answerCallbackQuery().catch(() => {})
  return true
}

// ==================== ДИСПЕТЧЕР ТЕКСТА ====================

/** Вызывать в bot.on('message:text', ...) до остальной логики — см. WIRING.md. */
export async function handleAdminPanelText(ctx: Context): Promise<boolean> {
  const session = getSession(ctx)
  const input: ApInput | undefined = session?.adminPanelInput
  if (!input) return false
  if (!ctx.from || !isAdmin(ctx.from.id)) return false

  const text = ctx.message?.text?.trim()
  if (text === undefined) return false

  session.adminPanelInput = undefined

  try {
    switch (input.mode) {
      case 'search_user':
        await runUserSearch(ctx, text)
        break

      case 'search_team':
        await runTeamSearch(ctx, text)
        break

      case 'edit_user_field':
        await ap.adminUpdateUserField(input.telegramId!, input.field as any, text)
        await confirmAdminInput(ctx, '✅ Обновлено')
        await showUserCard(replyOnlyCtx(ctx), input.telegramId!)
        break

      case 'add_user_to_team': {
        const teams = await ap.adminSearchTeams(text)
        if (teams.length === 0) {
          await ctx.reply('Команда не найдена, попробуй другой запрос.')
          session.adminPanelInput = input // остаёмся в режиме ввода
          return true
        }
        const kb = new InlineKeyboard()
        for (const t of teams) {
          kb.text(t.name, apCb('u', input.telegramId!, 'addteam_pick', t._id.toString())).row()
        }
        await ctx.reply('Выбери команду:', { reply_markup: kb })
        break
      }

      case 'edit_team_name':
        await ap.adminUpdateTeamName(input.teamId!, text)
        await confirmAdminInput(ctx, '✅ Название обновлено')
        await showTeamCard(replyOnlyCtx(ctx), input.teamId!)
        break

      case 'transfer_ownership': {
        const newOwnerId = Number(text)
        if (!Number.isFinite(newOwnerId)) throw new Error('ID должен быть числом')
        await ap.adminTransferOwnership(input.teamId!, newOwnerId)
        await confirmAdminInput(ctx, '✅ Владение передано')
        await showTeamCard(replyOnlyCtx(ctx), input.teamId!)
        break
      }

      case 'add_team_member': {
        const telegramId = Number(text)
        if (!Number.isFinite(telegramId)) throw new Error('ID должен быть числом')
        await ap.adminAddTeamMember(input.teamId!, telegramId)
        await confirmAdminInput(ctx, '✅ Участник добавлен')
        await showTeamCard(replyOnlyCtx(ctx), input.teamId!)
        break
      }

      case 'set_team_sub_date': {
        const date = ap.parseDateInput(text)
        await ap.adminSetTeamSubExpiry(input.teamId!, input.product!, date)
        await confirmAdminInput(ctx, '✅ Дата обновлена')
        await showTeamProductCard(replyOnlyCtx(ctx), input.teamId!, input.product!)
        break
      }

      case 'set_team_sub_meta': {
        const value = input.field === 'flowNumber' ? Number(text) : text
        await ap.adminSetTeamSubMetaField(input.teamId!, input.product!, input.field!, value)
        await confirmAdminInput(ctx, '✅ Обновлено')
        await showTeamProductCard(replyOnlyCtx(ctx), input.teamId!, input.product!)
        break
      }

      case 'stream_field':
        await ap.adminUpdateStream(input.flowNumber!, {
          [input.field!]: input.field === 'capacity' ? Number(text) : text,
        } as any)
        await confirmAdminInput(ctx, '✅ Обновлено')
        await showStreamCard(replyOnlyCtx(ctx), input.flowNumber!)
        break

      case 'stream_date': {
        const date = ap.parseDateInput(text)
        await ap.adminSetStreamExpiry(input.flowNumber!, date)
        await confirmAdminInput(ctx, '✅ Дата обновлена')
        await showStreamCard(replyOnlyCtx(ctx), input.flowNumber!)
        break
      }

      case 'add_team_to_stream': {
        const teams = await ap.adminSearchTeams(text)
        if (teams.length === 0) {
          await ctx.reply('Команда не найдена, попробуй другой запрос.')
          session.adminPanelInput = input
          return true
        }
        const kb = new InlineKeyboard()
        for (const t of teams) {
          kb.text(t.name, apCb('stream', input.flowNumber!, 'addteam_pick', t._id.toString())).row()
        }
        await ctx.reply('Выбери команду:', { reply_markup: kb })
        break
      }

      case 'stream_new':
        await handleStreamCreationStep(ctx, input, text)
        break

      default:
        return false
    }
  } catch (err: any) {
    await ctx.reply('❌ ' + (err.message || 'Ошибка'))
  }

  return true
}

async function handleStreamCreationStep(ctx: Context, input: ApInput, text: string) {
  const session = getSession(ctx)
  const draft = input.draft || {}

  if (input.step === 'email') {
    draft.email = text
    session.adminPanelInput = { mode: 'stream_new', step: 'password', draft } as ApInput
    await ctx.reply('Введи пароль:')
    return
  }
  if (input.step === 'password') {
    draft.password = text
    session.adminPanelInput = { mode: 'stream_new', step: 'chatLink', draft } as ApInput
    await ctx.reply('Введи ссылку на чат потока (или "-" чтобы пропустить):')
    return
  }
  if (input.step === 'chatLink') {
    draft.chatLink = text === '-' ? '' : text
    session.adminPanelInput = { mode: 'stream_new', step: 'capacity', draft } as ApInput
    await ctx.reply('Введи вместимость (число, или "-" для значения по умолчанию 30):')
    return
  }
  if (input.step === 'capacity') {
    draft.capacity = text === '-' ? 30 : Number(text)
    const stream = await ap.adminCreateStream(draft)
    await ctx.reply(`✅ Поток создан: #${stream.flowNumber}`)
    await showStreamCard(replyOnlyCtx(ctx), stream.flowNumber)
  }
}

/**
 * Экраны написаны в расчёте на editMessageText (когда вызваны из callback).
 * После текстового ввода callbackQuery нет — подменяем editMessageText на reply.
 */
function replyOnlyCtx(ctx: Context): Context {
  const proxy = Object.create(ctx)
  proxy.editMessageText = async (text: string, opts: any) => {
    const session = getSession(ctx)
    const panelMessageId = session?.supportPanelMessageId

    if (ctx.chat?.id === SUPPORT_GROUP_ID && panelMessageId) {
      try {
        return await ctx.api.editMessageText(ctx.chat.id, panelMessageId, text, opts)
      } catch {
        session.supportPanelMessageId = undefined
      }
    }

    const sent = await ctx.reply(text, opts)
    if (ctx.chat?.id === SUPPORT_GROUP_ID && session) {
      session.supportPanelMessageId = sent.message_id
    }
    return sent
  }
  return proxy
}
