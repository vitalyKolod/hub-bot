'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Product } from '@/lib/types'
import { ProductCard } from '@/components/product-card'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'
const filters=[['all','Все'],['screens','Экраны'],['graphics','Графика'],['software','Софт']] as const
const categories:Record<string,string>={procontent:'screens',sunday_screens:'screens',storyloops:'screens',cmg:'graphics',cgs:'graphics',propresenter:'software',yandex_360:'software'}
export default function CatalogPage(){
  const [filter,setFilter]=useState<(typeof filters)[number][0]>('all')
  const query=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')})
  if(query.isLoading)return <PageSkeleton/>
  const products=query.data?.filter(product=>filter==='all'||categories[product.id]===filter)
  return <main className="page"><PageTitle eyebrow="HUB Store" title="Медиа для служения" description="Выберите то, что поможет команде"/><div className="hide-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">{filters.map(([id,label])=><button key={id} onClick={()=>setFilter(id)} aria-pressed={filter===id} className={`min-h-9 shrink-0 rounded-full border px-4 text-xs font-bold ${filter===id?'border-white bg-white text-[#111115]':'border-[#303038] bg-[#17171c] text-[#e7e7eb]'}`}>{label}</button>)}</div>{query.isError?<ErrorState retry={()=>query.refetch()}/>:products?.length?<div className="grid grid-cols-2 gap-2.5">{products.map(product=><ProductCard key={product.id} product={product}/>)}</div>:<EmptyState title="Ничего не найдено" description="Попробуйте другой фильтр каталога."/>}</main>
}
