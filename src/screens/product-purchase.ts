import { InlineKeyboard } from 'grammy'
import { packCb } from '../core/callback.js'
import { isTeamProductPurchaseLocked } from '../services/team.service.js'

export async function buildProductPurchaseKeyboard(teamId: string, productId: string) {
  const kb = new InlineKeyboard()
  const locked = await isTeamProductPurchaseLocked(teamId, productId)

  if (locked) {
    kb.text('✅ Уже оплачено', packCb({ a: 'noop' })).row()
  } else {
    kb.text('ОПЛАТИТЬ СРАЗУ', packCb({ a: 'pay_product', p: `${productId}:${teamId}` }))
      .icon('5318912792428814144')
      .row()
    kb.text('🛒 В корзину', packCb({ a: 'add_to_cart', p: `${productId}:${teamId}` })).row()
    kb.text('🛒 Перейти в корзину', packCb({ a: 'open', s: 'cart', p: teamId })).row()
  }

  kb.url('ОСТАЛИСЬ ВОПРОСЫ?', 'https://t.me/hubbbhelp_bot')
    .icon('5436113877181941026')
    .row()
  kb.text('◀️ НАЗАД', packCb({ a: 'back' }))
  return kb
}
