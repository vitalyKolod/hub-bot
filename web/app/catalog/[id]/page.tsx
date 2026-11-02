'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Product } from '@/lib/types'
import { BotButton } from '@/components/bot-button'
import { ProductIcon } from '@/components/product-icon'
import { ErrorState, PageSkeleton } from '@/components/ui'
export default function ProductPage(){
  const {id}=useParams<{id:string}>()
  const query=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')})
  if(query.isLoading)return <PageSkeleton/>
  const product=query.data?.find(item=>item.id===id)
  if(query.isError||!product)return <main className="page"><ErrorState retry={()=>query.refetch()}/></main>
  return <main className="page"><Link href="/catalog" className="muted mb-4 inline-flex items-center gap-1.5 text-xs font-bold"><ArrowLeft size={15}/>Каталог</Link><div className="card flex items-center gap-4 p-5"><ProductIcon id={product.id} name={product.name} size={76}/><div className="min-w-0"><p className="eyebrow">Продукт HUB</p><h1 className="mt-2 text-[24px] font-extrabold leading-tight">{product.name}</h1></div></div>{product.active&&<span className="mt-5 inline-flex items-center gap-1 rounded-full bg-[#34d399]/10 px-2.5 py-1.5 text-[10px] font-bold text-[#34d399]"><CheckCircle2 size={13}/>Подключена</span>}<p className="muted mt-4 text-sm leading-6">{product.description}</p><div className="card mt-6 p-5"><p className="muted text-xs">Стоимость подписки</p><p className="display-font mt-1 text-xl font-bold">{product.priceRub===null?'По запросу':`${product.priceRub.toLocaleString('ru-RU')} ₽`}</p><p className="muted mt-3 text-xs leading-5">Оформление и продление доступны в Telegram-боте HUB.</p><div className="mt-5"><BotButton label={product.active?'Продлить в боте':product.priceRub===null?'Уточнить в боте':'Подключить в боте'}/></div></div></main>
}
