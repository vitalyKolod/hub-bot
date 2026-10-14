import { renderSupportUi, renderHelpUi } from '../ui/supportUi.js'
import { InlineKeyboard } from 'grammy'
import { isValidObjectId } from 'mongoose'
import { PRODUCTS } from '../config/products.js'
import { PaymentModel } from '../models/Payment.js'
import { TeamModel } from '../models/Team.js'
import { ConversationModel } from '../models/Conversation.js'
import { SUPPORT_CATEGORIES, SUPPORT_ISSUES, paymentLabel, productTitle, type SupportCategory, type SupportDraft } from '../services/supportContext.js'

const teamsFor = (userId: number) => TeamModel.find({ $or: [{ ownerId: userId }, { 'members.telegramId': userId }] })

const SUPPORT_CATEGORY_ICONS: Partial<Record<SupportCategory, string>> = {
  payment: '5296320796300426938',
  subscription: '5373330964372004748',
  team: '5296533616224906961',
  propresenter: '5251272469175631339',
  yandex360: '5310051278464778081',
}

export function supportCategoriesKeyboard() {
  const kb = new InlineKeyboard()
  for (const [id, label] of Object.entries(SUPPORT_CATEGORIES)) {
    const icon = SUPPORT_CATEGORY_ICONS[id as SupportCategory]
    kb.text(icon ? label.slice(label.indexOf(' ') + 1) : label, `s2:category:${id}`)
    if (icon) kb.icon(icon)
    kb.row()
  }
  return kb.text('← Назад', 's2:back')
}

async function display(ctx: any) {
  const d: SupportDraft = ctx.session.supportDraft
  let kb = new InlineKeyboard()
  let text = ''
  if (d.step === 'categories') {
    text = '💬 ПОДДЕРЖКА\n\nС чем вам нужна помощь?'
    kb = supportCategoriesKeyboard()
  } else if (d.step === 'issues') {
    const team = d.metadata.teamId ? d.options?.find(option => option.id === d.metadata.teamId) : undefined
    text = `${SUPPORT_CATEGORIES[d.metadata.category!]}\n\n${team ? `Команда: ${team.label.replace(/^👥 /, '')}\n\n` : ''}Что случилось?`
    for (const [id, label] of Object.entries(SUPPORT_ISSUES[d.metadata.category!])) kb.text(label, `s2:issue:${id}`).row()
  } else if (d.step === 'message') {
    text = d.metadata.source === 'payment_rejection'
      ? '💬 ВОПРОС ПО ОПЛАТЕ\n\nОпишите, пожалуйста, что хотите уточнить по этой оплате.'
      : '💬 ОПИШИТЕ ВОПРОС\n\nНапишите одним или несколькими сообщениями, что произошло. Можно отправлять фото, видео, документы и голосовые.'
    const team = d.metadata.teamId ? d.options?.find(option => option.id === d.metadata.teamId) : undefined
    const summary = [
      team ? `Команда: ${team.label.replace(/^👥 /, '')}` : null,
      d.metadata.category ? `Тема: ${SUPPORT_CATEGORIES[d.metadata.category]}` : null,
      d.metadata.subcategory ? `Причина: ${SUPPORT_ISSUES[d.metadata.category!]?.[d.metadata.subcategory] || 'Другое'}` : null,
      d.metadata.productIds?.length ? `Продукты: ${d.metadata.productIds.map(id => productTitle(id)).join(', ')}` : null,
    ].filter(Boolean).join('\n')
    if (summary && d.metadata.source !== 'payment_rejection') {
      text = text.replace('\n\n', `\n\n${summary}\n\n`)
    }
  } else {
    text = { teams: '👥 КОМАНДА / ВОЛОНТЁРЫ\n\nВыберите команду:', payments: '💳 ВЫБЕРИТЕ ОПЛАТУ', subscriptions: '📦 Выберите одну или несколько подписок', products: 'Какой продукт вас интересует?' }[d.step]
    const page = d.page || 0
    const options = d.options || []
    for (const [offset, option] of options.slice(page * 8, (page + 1) * 8).entries()) {
      const index = page * 8 + offset
      const mark = d.step === 'subscriptions' ? (d.metadata.productIds?.includes(option.id) ? '☑ ' : '☐ ') : ''
      kb.text(`${mark}${option.label}`.slice(0, 120), `s2:pick:${index}`).row()
    }
    if (page > 0) kb.text('‹ Предыдущие', `s2:page:${page - 1}`)
    if ((page + 1) * 8 < options.length) kb.text('Следующие ›', `s2:page:${page + 1}`)
    kb.row()
    kb.text(d.step === 'subscriptions' ? '✅ Продолжить' : 'Продолжить без выбора', 's2:continue').row()
  }
  if (d.step !== 'categories') kb.text('← Назад', 's2:back')
  if (d.step === 'message') kb.row().text('✅ Завершить диалог', 'support:close:user')
  d.messageId = await renderSupportUi(ctx, text, kb)
}
function advance(d: SupportDraft, step: SupportDraft['step']) {
  d.history.push({ step: d.step, metadata: structuredClone(d.metadata) })
  d.step = step
  d.page = 0
  return step
}
async function optionsFor(ctx: any) {
  const d: SupportDraft = ctx.session.supportDraft
  d.page = 0
  if (d.step === 'teams') {
    d.options = (await teamsFor(ctx.from.id)).map(t => ({ id: t.id, label: `👥 ${t.name}` }))
  } else if (d.step === 'subscriptions') {
    const products = new Set<string>()
    for (const team of await teamsFor(ctx.from.id)) {
      const entries = team.subscriptions instanceof Map ? [...team.subscriptions.entries()] : Object.entries(team.subscriptions || {})
      for (const [id, sub] of entries) if (sub && (sub as any).status !== 'none') products.add(id)
    }
    d.options = [...products].map(id => ({ id, label: productTitle(id) }))
  } else if (d.step === 'products') {
    d.options = Object.values(PRODUCTS).filter(p => p.cartable || p.priceRub !== null || p.priceUsd !== null).map(p => ({ id: p.id, label: p.name }))
  } else if (d.step === 'payments') {
    const status = { payment_rejected: ['rejected'], payment_pending: ['pending', 'processing'], payment_access: ['accepted'] }[d.metadata.subcategory!]
    const payments = await PaymentModel.find({ userId: ctx.from.id, status: { $in: status } }).sort({ createdAt: -1 })
    d.options = payments.map(p => ({ id: p.id, label: paymentLabel(p) }))
  }
}

export async function startSupportFlow(ctx: any, paymentId?: string) {
  if (ctx.chat?.type !== 'private') return
  let metadata: SupportDraft['metadata'] = { source: 'support_menu' }
  if (paymentId) {
    if (!isValidObjectId(paymentId)) throw new Error('Платёж недоступен')
    const payment = await PaymentModel.findById(paymentId)
    // Rejection notifications are delivered to the team owner; allow that recipient too.
    const team = payment && payment.userId !== ctx.from.id && isValidObjectId(payment.teamId) ? await TeamModel.findOne({ _id: payment.teamId, ownerId: ctx.from.id }) : null
    if (!payment || (payment.userId !== ctx.from.id && !team)) throw new Error('Платёж недоступен')
    metadata = { source: 'payment_rejection', category: 'payment', subcategory: 'payment_rejected', paymentId }
  }
  // Same userActive switch used by conversation activation. No close/status changes.
  await ConversationModel.updateMany({ userId: ctx.from.id, userActive: true }, { $set: { userActive: false } })
  ctx.session.waitingForReceipt = false
  ctx.session.inSupportMode = Boolean(paymentId)
  ctx.session.supportUiOpened = false
  ctx.session.supportDraft = { step: paymentId ? 'message' : 'categories', metadata, history: [] }
  await display(ctx)
}

export async function handleSupportFlowCallback(ctx: any, data: string) {
  if (data !== 'support:start' && !data.startsWith('s2:')) return false
  if (ctx.chat?.type !== 'private') { await ctx.answerCallbackQuery(); return true }
  const previousDraft = ctx.session.supportDraft ? structuredClone(ctx.session.supportDraft) : undefined
  const previousMode = ctx.session.inSupportMode
  try {
    if (data === 'support:start' || data.startsWith('s2:reject:')) {
      await startSupportFlow(ctx, data.startsWith('s2:reject:') ? data.slice('s2:reject:'.length) : undefined)
      await ctx.answerCallbackQuery()
      return true
    }
    let d: SupportDraft | undefined = ctx.session.supportDraft
    // Category buttons may also come from the static help screen.
    const fromHelpScreen = !d && data.startsWith('s2:category:')
    if (fromHelpScreen) { await startSupportFlow(ctx); d = ctx.session.supportDraft }
    if (!d) { await ctx.answerCallbackQuery({ text: 'Откройте поддержку заново' }); return true }
    if (!fromHelpScreen && d.messageId && ctx.callbackQuery.message?.message_id !== d.messageId) {
      await ctx.answerCallbackQuery({ text: 'Используйте последнее меню поддержки' }); return true
    }
    const [, action, value] = data.split(':')
    if (action === 'back') {
      if (d.step === 'categories') {
        await renderHelpUi(ctx)
        ctx.session.supportDraft = undefined
        ctx.session.inSupportMode = false
        await ctx.answerCallbackQuery()
        return true
      }
      const previous = d.history.pop()
      if (previous) { d.step = previous.step; d.metadata = previous.metadata; await optionsFor(ctx) }
      else { d.step = 'categories'; d.metadata = { source: 'support_menu' } }
      ctx.session.inSupportMode = false
      await display(ctx)
    } else if (action === 'category' && d.step === 'categories' && Object.hasOwn(SUPPORT_CATEGORIES, value)) {
      d.step = advance(d, value === 'other' ? 'message' : value === 'team' ? 'teams' : 'issues')
      d.metadata = { source: 'support_menu', category: value as SupportCategory }
      if (d.step === 'teams') {
        await optionsFor(ctx)
        if (!d.options?.length) d.step = 'issues'
      }
      ctx.session.inSupportMode = d.step === 'message'
      await display(ctx)
    } else if (action === 'issue' && d.step === 'issues' && Object.hasOwn(SUPPORT_ISSUES[d.metadata.category!], value)) {
      d.step = advance(d, 'message')
      d.metadata.subcategory = value
      if (d.metadata.category === 'subscription') d.step = 'subscriptions'
      if (d.metadata.category === 'payment') {
        if (['payment_rejected', 'payment_pending', 'payment_access'].includes(value)) d.step = 'payments'
        else if (value === 'pricing') d.step = 'products'
      }
      if (d.step !== 'message') {
        await optionsFor(ctx)
        if (!d.options?.length) d.step = 'message'
        else if (d.step === 'payments' && d.options.length === 1) { d.metadata.paymentId = d.options[0].id; d.step = 'message' }
      }
      ctx.session.inSupportMode = d.step === 'message'
      await display(ctx)
    } else if (action === 'page' && ['teams', 'payments', 'subscriptions', 'products'].includes(d.step)) {
      const page = Number(value)
      if (!Number.isInteger(page) || page < 0 || page * 8 >= (d.options?.length || 0)) throw new Error('Страница недоступна')
      d.page = page
      await display(ctx)
    } else if (action === 'pick' && ['teams', 'payments', 'subscriptions', 'products'].includes(d.step)) {
      const option = /^\d+$/.test(value) ? d.options?.[Number(value)] : undefined
      if (!option) throw new Error('Выберите вариант из списка')
      if (d.step === 'subscriptions') {
        const selected = new Set(d.metadata.productIds || [])
        selected.has(option.id) ? selected.delete(option.id) : selected.add(option.id)
        d.metadata.productIds = [...selected]
      } else {
        const step = d.step
        d.step = advance(d, step === 'teams' ? 'issues' : 'message')
        if (step === 'teams') d.metadata.teamId = option.id
        if (step === 'payments') d.metadata.paymentId = option.id
        if (step === 'products') d.metadata.productIds = [option.id]
      }
      ctx.session.inSupportMode = d.step === 'message'
      await display(ctx)
    } else if (action === 'continue' && ['teams', 'payments', 'subscriptions', 'products'].includes(d.step)) {
      d.step = advance(d, d.step === 'teams' ? 'issues' : 'message')
      ctx.session.inSupportMode = d.step === 'message'
      await display(ctx)
    }
    await ctx.answerCallbackQuery()
  } catch (error) {
    ctx.session.supportDraft = previousDraft
    ctx.session.inSupportMode = previousMode
    console.error('Support flow:', error)
    await ctx.answerCallbackQuery({ text: 'Не удалось открыть этот шаг. Попробуйте снова.', show_alert: true })
  }
  return true
}

/** Selection is not a conversation: never send an early message to payment/support. */
export async function guardSupportSelection(ctx: any) {
  if (ctx.chat?.type !== 'private' || !ctx.session.supportDraft || ctx.session.supportDraft.step === 'message') return false
  await ctx.reply('Выберите тему обращения с помощью кнопок выше.')
  return true
}
