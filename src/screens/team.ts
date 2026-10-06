import { FormattedString } from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import type { ScreenView } from '../core/render.js'
import { getTeamById, hasActiveTeamSubscription } from '../services/team.service.js'
import { getLatestPaymentStatesForTeam } from '../services/payment.service.js'
import { listTeamDevices, DEVICE_ICON } from '../services/proPresenterDevice.service.js'
import { ProPresenterStreamModel } from '../models/ProPresenterStream.js'
import { UserModel } from '../models/User.js'
import { getProduct } from '../config/products.js'

const PRODUCTS = [
  { id: 'procontent', name: 'ProContent', icon: '5251299351375937406' },
  { id: 'cmg', name: 'CMG', icon: '5310127020213043624' },
  { id: 'sunday_screens', name: 'Sunday Screens', icon: '5291749654017381020' },
  { id: 'cgs', name: 'CGS', icon: '5190419001703963847' },
  { id: 'storyloops', name: 'StoryLoops', icon: '5190877553887323413' },
] as const
type Subscription = { status?: string; expiresAt?: Date | null; meta?: any } | undefined
type Payment = { status?: string; rejectionReason?: string | null } | undefined

const active = (sub: Subscription) => sub?.status === 'active' && !!sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()
const days = (date?: Date | null) => date ? Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)) : 0
const dateText = (date?: Date | null) => date ? new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
function status(sub: Subscription, payment?: Payment) {
  if (active(sub)) return '✅ Активна'
  if (payment?.status === 'pending' || sub?.status === 'pending') return '⏳ На проверке'
  if (payment?.status === 'rejected') return '❌ Оплата отклонена'
  if (sub?.status === 'expired' || sub?.status === 'active') return '❌ Подписка закончилась'
  return '❌ Нет'
}
function shouldShowRenewal(sub: Subscription) {
  if (!sub || !['active', 'expired'].includes(sub.status || '')) return false
  return !sub.expiresAt || new Date(sub.expiresAt).getTime() - Date.now() <= 14 * 86_400_000
}
function productLine(name: string, icon: string, sub: Subscription, payment?: Payment, detailed = false) {
  let text = new FormattedString('').emoji('🎬', icon).plain(` ${name}\n┗ Статус: `).bold(status(sub, payment))
  if (active(sub)) {
    text = text.plain(`\n┗ Осталось: ${days(sub?.expiresAt)} дн.`)
    if (detailed) text = text.plain(`\n┗ До: ${dateText(sub?.expiresAt)}`)
    if (payment?.status === 'pending') text = text.plain('\n┗ Продление: ⏳ На проверке')
  } else if (detailed && payment?.status === 'rejected' && payment.rejectionReason) text = text.plain(`\n┗ Причина: ${payment.rejectionReason}`)
  return text
}
async function data(teamId: string) {
  const team = await getTeamById(teamId)
  if (!team) throw new Error('Team not found')
  const payments = await getLatestPaymentStatesForTeam(teamId)
  const byProduct = new Map<string, Payment>()
  for (const payment of payments) if (!byProduct.has(payment.productId)) byProduct.set(payment.productId, payment)
  return { team, byProduct }
}
const header = (name: string) => new FormattedString('').bold(`👥 КОМАНДА: ${name}`).plain('\n━━━━━━━━━━━━━━\n')
function navigation(kb: InlineKeyboard) {
  kb.text('◀️ НАЗАД', packCb({ a: 'back' })).text('🏠 ГЛАВНОЕ МЕНЮ', packCb({ a: 'home' })).row()
}
async function propData(teamId: string, sub: Subscription) {
  const devices = await listTeamDevices(teamId)
  const streams = devices.length ? await ProPresenterStreamModel.find({ flowNumber: { $in: [...new Set(devices.map(device => device.flowNumber))] } }) : []
  const nextExpiry = streams.filter(stream => stream.expiresAt && new Date(stream.expiresAt).getTime() > Date.now()).map(stream => stream.expiresAt!).sort((a, b) => a.getTime() - b.getTime())[0]
  return { devices, streams, nextExpiry: nextExpiry || (active(sub) ? sub?.expiresAt : null) }
}

export async function teamScreen(userId: number, input: string | { teamId: string }): Promise<ScreenView> {
  const teamId = typeof input === 'string' ? input : input.teamId
  const { team, byProduct } = await data(teamId)
  const owner = await UserModel.findOne({ telegramId: team.ownerId })
  const prop = team.subscriptions.get('propresenter')
  const { nextExpiry } = await propData(teamId, prop)
  let propQuote = new FormattedString('').emoji('🎬', '5251272469175631339').plain(' ProPresenter\n┗ Статус: ').bold(nextExpiry ? '✅ Активна' : status(prop, byProduct.get('propresenter')))
  if (nextExpiry) propQuote = propQuote.plain(`\n┗ Осталось: ${days(nextExpiry)} дн.`)
  const activeContentCount = PRODUCTS.filter(product => active(team.subscriptions.get(product.id))).length
  let contentQuote = new FormattedString('').emoji('🖥', '5373330964372004748').plain(' Контент для экранов\n\n').bold(`Подписок ${activeContentCount}/${PRODUCTS.length}\n`)
  for (const product of PRODUCTS) contentQuote = contentQuote.plain('\n').concat(productLine(product.name, product.icon, team.subscriptions.get(product.id), byProduct.get(product.id))).plain('\n')
  const message = header(team.name).bold('⛪ ПОДПИСКИ\n\n').expandableBlockquote(propQuote).plain('\n\n━━━━━━━━━━━━━━\n').expandableBlockquote(contentQuote).plain('\n━━━━━━━━━━━━━━\n').bold('👑 Владелец\n').plain(`${owner?.fio || 'Не найден'}\n━━━━━━━━━━━━━━\n`).bold('Состав команды:\n').bold(`👥 Участников: ${team.members.length}`)
  const kb = new InlineKeyboard()
  kb.text('ProPresenter', packCb({ a: 'open', s: 'team_propresenter', p: teamId })).icon('5251272469175631339').row()
  kb.text('КОНТЕНТ ДЛЯ ЭКРАНОВ', packCb({ a: 'open', s: 'team_content', p: teamId })).icon('5373330964372004748').row()
  kb.text('КОМАНДА', packCb({ a: 'open', s: 'team_members', p: teamId })).icon('5296533616224906961').row()
  navigation(kb)
  return { photo: './public/my-teams.png', caption: message.caption, caption_entities: message.caption_entities, keyboard: kb }
}

export async function teamProPresenterScreen(userId: number, teamId: string): Promise<ScreenView> {
  const { team, byProduct } = await data(teamId)
  const prop = team.subscriptions.get('propresenter')
  const { devices, streams, nextExpiry } = await propData(teamId, prop)
  const meta = prop?.meta as { flowNumber?: number; chatLink?: string } | undefined
  const hasActiveFlow = streams.some(stream => stream.expiresAt && new Date(stream.expiresAt).getTime() > Date.now()) || (active(prop) && !!meta?.flowNumber)
  let quote = new FormattedString('').emoji('🎬', '5251272469175631339').plain(' ProPresenter\n┗ Статус: ').bold(nextExpiry ? '✅ Активна' : status(prop, byProduct.get('propresenter')))
  if (nextExpiry) quote = quote.plain(`\n┗ Осталось: ${days(nextExpiry)} дн.`)
  quote = quote.plain('\n').emoji('🖥', DEVICE_ICON).plain(` Устройства: ${devices.length}`)
  for (const device of devices.slice(0, 5)) quote = quote.plain(`\n┗ ${device.name} · поток №${device.flowNumber}`)
  if (devices.length > 5) quote = quote.plain(`\n┗ Ещё ${devices.length - 5} — в разделе «Устройства»`)
  const message = header(team.name).bold('⛪ ПОДПИСКИ\n\n').expandableBlockquote(quote)
  const kb = new InlineKeyboard()
  if (devices.length || ['active', 'expired'].includes(prop?.status || '')) kb.text('УСТРОЙСТВА', packCb({ a: 'open', s: 'devices', p: teamId })).icon(DEVICE_ICON).row()
  const links = new Map<number, string>()
  for (const stream of streams) if (stream.chatLink) links.set(stream.flowNumber, stream.chatLink)
  if (active(prop) && meta?.chatLink && meta.flowNumber && !links.has(meta.flowNumber)) links.set(meta.flowNumber, meta.chatLink)
  for (const [number, link] of links) kb.url(`Чат потока №${number}`, link).icon('5251272469175631339').row()
  if (team.ownerId === userId && !hasActiveFlow) kb.text('ДОБАВИТЬ PROPRESENTER', packCb({ a: 'open', s: 'propresenter', p: teamId })).icon('5397916757333654639').row()
  navigation(kb)
  return { photo: './public/team-propresenter.png', caption: message.caption, caption_entities: message.caption_entities, keyboard: kb }
}

export async function teamContentScreen(userId: number, teamId: string): Promise<ScreenView> {
  const { team, byProduct } = await data(teamId)
  const activeContentCount = PRODUCTS.filter(product => active(team.subscriptions.get(product.id))).length
  let quote = new FormattedString('').emoji('🖥', '5373330964372004748').plain(' Контент для экранов\n\n').bold(`Подписок ${activeContentCount}/${PRODUCTS.length}\n`)
  for (const product of PRODUCTS) quote = quote.plain('\n').concat(productLine(product.name, product.icon, team.subscriptions.get(product.id), byProduct.get(product.id), true)).plain('\n')
  const message = header(team.name).expandableBlockquote(quote)
  const kb = new InlineKeyboard()
  for (const product of PRODUCTS) if (active(team.subscriptions.get(product.id))) kb.text(`Чат — ${product.name}`, `chat_access:${product.id}`).icon(product.icon).row()
  if (team.ownerId === userId) {
    for (const product of PRODUCTS) if (shouldShowRenewal(team.subscriptions.get(product.id))) {
      kb.text(`Продлить ${getProduct(product.id)?.name || product.name}`, packCb({ a: 'open', s: product.id, p: teamId })).icon('5346321684574003384').row()
    }
    kb.text('ДОБАВИТЬ ПОДПИСКУ', packCb({ a: 'open', s: 'content_menu', p: teamId })).icon('5397916757333654639').row()
  }
  navigation(kb)
  return { photo: './public/team-content.png', caption: message.caption, caption_entities: message.caption_entities, keyboard: kb }
}

export async function teamMembersScreen(userId: number, input: string): Promise<ScreenView> {
  const [teamId, pageText] = input.split(':')
  const { team } = await data(teamId)
  const owner = await UserModel.findOne({ telegramId: team.ownerId })
  const pageSize = 5
  const lastPage = Math.max(0, Math.ceil(team.members.length / pageSize) - 1)
  const page = Math.min(Math.max(0, Number(pageText) || 0), lastPage)
  const members = team.members.slice(page * pageSize, (page + 1) * pageSize)
  const profiles = await UserModel.find({ telegramId: { $in: members.map(member => member.telegramId) } })
  const byId = new Map(profiles.map(profile => [profile.telegramId, profile]))
  let quote = new FormattedString('').plain('Состав команды:\n').bold(`👥 Участников: ${team.members.length}\n`)
  for (const member of members) {
    const profile = byId.get(member.telegramId)
    quote = quote.plain(`\n${member.telegramId === team.ownerId ? '👑' : '👤'} ${profile?.fio || 'Без имени'}${member.telegramId === userId ? ' (ВЫ)' : ''}`)
      .plain(`\n┗ Username: ${profile?.username ? `@${profile.username}` : 'Не указан'}`)
      .plain(`\n┗ ID: ${member.telegramId}\n`)
  }
  const message = header(team.name).bold('👑 Владелец\n').plain(`${owner?.fio || 'Не найден'}\n━━━━━━━━━━━━━━\n`).expandableBlockquote(quote)
  const kb = new InlineKeyboard()
  if (page > 0) kb.text('◀️ Предыдущие', packCb({ a: 'open', s: 'team_members', p: `${teamId}:${page - 1}` }))
  if (page < lastPage) kb.text('Следующие ▶️', packCb({ a: 'open', s: 'team_members', p: `${teamId}:${page + 1}` }))
  if (page > 0 || page < lastPage) kb.row()
  if (team.ownerId === userId && hasActiveTeamSubscription(team)) kb.text('ДОБАВИТЬ УЧАСТНИКА', packCb({ a: 'open', s: 'add_volunteer', p: teamId })).icon('5258362837411045098').row()
  navigation(kb)
  return { photo: './public/my-teams.png', caption: message.caption, caption_entities: message.caption_entities, keyboard: kb }
}
