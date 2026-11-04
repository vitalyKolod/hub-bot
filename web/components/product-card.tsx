import Link from 'next/link'
import { ArrowUpRight, Check, ShoppingCart } from 'lucide-react'
import type { Product } from '@/lib/types'
import { ProductIcon } from './product-icon'

type Props = {
  product: Product
  connected: boolean
  purchaseLocked: boolean
  inCart: boolean
  teamId?: string
  adding: boolean
  onAdd: () => void
}

export function ProductCard({product,connected,purchaseLocked,inCart,teamId,adding,onAdd}:Props){
  const price=product.priceRub===null?'По запросу':`${product.priceRub.toLocaleString('ru-RU')} ₽`
  return <article className="card product-tile flex min-h-[252px] min-w-0 flex-col overflow-hidden p-3">
    <Link href={`/catalog/${product.id}`} className="group block rounded-xl focus-visible:outline-offset-2" aria-label={`Подробнее о ${product.name}`}>
      <div className="relative flex h-[91px] items-center justify-center rounded-[14px] border border-white/[.04] bg-[radial-gradient(circle_at_50%_20%,#292932,#19191f_75%)]">
        <ProductIcon id={product.id} name={product.name} size={60}/>
        {connected&&<span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full border border-[#34d399]/25 bg-[#123029] px-1.5 py-1 text-[9px] font-bold text-[#34d399]"><Check aria-hidden="true" size={10}/>Подключена</span>}
      </div>
      <h2 className="mt-2.5 line-clamp-2 text-[13px] font-extrabold leading-[1.3] tracking-[-.02em] group-hover:text-white">{product.name}</h2>
    </Link>
    <p className="muted mt-1 line-clamp-2 text-[10px] leading-[15px]">{product.description}</p>
    <div className="mt-auto pt-2.5">
      <p className="display-font mb-2 text-[12px] font-bold">{price}</p>
      {inCart?<Link href={teamId?`/cart?team=${teamId}`:'/cart'} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#ff6a1f]/25 bg-[#ff6a1f]/10 text-[11px] font-extrabold text-[#ff874c]"><ShoppingCart aria-hidden="true" size={15}/>В корзине</Link>
      :product.cartable&&teamId&&!purchaseLocked?<button type="button" onClick={onAdd} disabled={adding} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff6a1f] text-[11px] font-extrabold text-[#170a04] transition-colors hover:bg-[#ff8a4d] active:bg-[#e65a15] disabled:opacity-60"><ShoppingCart aria-hidden="true" size={15}/>{adding?'Добавляем…':connected?'Продлить':'В корзину'}</button>
      :purchaseLocked?<span className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-white/[.08] bg-white/[.03] px-1 text-center text-[10px] font-bold text-[#a0a0aa]"><ShoppingCart aria-hidden="true" size={14}/>Продлить за 14 дней</span>
      :<Link href={`/catalog/${product.id}`} className="flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[#ff6a1f]/12 text-[11px] font-extrabold text-[#ff874c]">Подробнее<ArrowUpRight aria-hidden="true" size={14}/></Link>}
    </div>
  </article>
}
