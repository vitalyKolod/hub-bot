import Link from 'next/link'
import { Check, Plus, ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/types'
import { ProductIcon } from './product-icon'

type Props = {
  product: Product
  connected: boolean
  inCart: boolean
  teamId?: string
  adding: boolean
  onAdd: () => void
}

export function ProductCard({product,connected,inCart,teamId,adding,onAdd}:Props){
  const price=product.priceRub===null?'По запросу':`${product.priceRub.toLocaleString('ru-RU')} ₽`
  return <article className="card product-tile flex min-h-[218px] min-w-0 flex-col p-3.5">
    <Link href={`/catalog/${product.id}`} className="block rounded-lg focus-visible:outline-offset-4" aria-label={`Подробнее о ${product.name}`}>
      <ProductIcon id={product.id} name={product.name} size={46}/>
      <h2 className="mt-3 line-clamp-2 text-[13px] font-extrabold leading-[1.3] tracking-[-.02em]">{product.name}</h2>
    </Link>
    <p className="muted mt-1 line-clamp-2 text-[11px] leading-4">{product.description}</p>
    <div className="mt-auto pt-3">
      <p className="display-font mb-2.5 text-[12px] font-bold">{price}</p>
      {connected?<span className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#34d399]/25 bg-[#34d399]/12 text-[11px] font-extrabold text-[#34d399]"><Check aria-hidden="true" size={14}/>Подключена</span>
      :inCart?<Link href={teamId?`/cart?team=${teamId}`:'/cart'} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#ff6a1f]/25 bg-[#ff6a1f]/10 text-[11px] font-extrabold text-[#ff874c]"><ShoppingBag aria-hidden="true" size={14}/>В корзине</Link>
      :product.cartable&&teamId?<button type="button" onClick={onAdd} disabled={adding} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff6a1f] text-[11px] font-extrabold text-[#170a04] transition-colors hover:bg-[#ff8a4d] active:bg-[#e65a15] disabled:opacity-60"><Plus aria-hidden="true" size={15}/>{adding?'Добавляем…':'В корзину'}</button>
      :<Link href={`/catalog/${product.id}`} className="flex min-h-10 items-center justify-center rounded-xl bg-[#ff6a1f]/12 text-[11px] font-extrabold text-[#ff874c]">Подробнее</Link>}
    </div>
  </article>
}
