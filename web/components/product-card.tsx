import Link from 'next/link'
import type { Product } from '@/lib/types'
import { ProductIcon } from './product-icon'
export function ProductCard({product}:{product:Product}){
  return <Link href={`/catalog/${product.id}`} className="card flex min-h-[228px] flex-col p-3.5 transition-colors hover:border-white/20"><ProductIcon cover={product.cover} name={product.name} size={46}/><h3 className="mt-3 line-clamp-2 text-[13px] font-extrabold leading-5">{product.name}</h3><p className="muted mt-1 line-clamp-2 text-[11px] leading-4">{product.description}</p><div className="mt-auto pt-3"><p className="display-font mb-2.5 text-[13px] font-bold">{product.priceRub===null?'По запросу':`${product.priceRub.toLocaleString('ru-RU')} ₽`}</p><span className={`flex min-h-9 items-center justify-center rounded-xl text-[11px] font-extrabold ${product.active?'bg-[#362019] text-[#ff6a1f]':'bg-[#ff6a1f] text-[#170a04]'}`}>{product.active?'Подключена ✓':'Подробнее'}</span></div></Link>
}
