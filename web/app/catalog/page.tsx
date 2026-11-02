'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import type { Cart, Product, Team } from '@/lib/types'
import { ProductCard } from '@/components/product-card'
import { useToast } from '@/components/toast'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'

const filters=[['all','Все'],['screens','Экраны'],['graphics','Графика'],['software','Софт']] as const
const categories:Record<string,string>={procontent:'screens',sunday_screens:'screens',storyloops:'screens',cmg:'graphics',cgs:'graphics',propresenter:'software',yandex_360:'software'}

export default function CatalogPage(){
  const [filter,setFilter]=useState<(typeof filters)[number][0]>('all')
  const [selectedTeamId,setSelectedTeamId]=useState('')
  const queryClient=useQueryClient()
  const toast=useToast()
  const productsQuery=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')})
  const teamsQuery=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  const ownerTeams=(teamsQuery.data||[]).filter(team=>team.viewerRole==='owner')
  const team=ownerTeams.find(item=>item.id===selectedTeamId)||ownerTeams[0]
  const cartQuery=useQuery({queryKey:['cart',team?.id],queryFn:()=>api<Cart>(`/api/teams/${team!.id}/cart`),enabled:Boolean(team)})
  const add=useMutation({
    mutationFn:({teamId,productId}:{teamId:string;productId:string})=>api<Cart>(`/api/teams/${teamId}/cart/items`,{method:'POST',body:JSON.stringify({productId})}),
    onSuccess:(cart,variables)=>{queryClient.setQueryData(['cart',variables.teamId],cart);haptic('success');toast('Товар добавлен в корзину')},
    onError:(error)=>toast(error instanceof Error?error.message:'Не удалось добавить товар'),
  })
  if(productsQuery.isLoading||teamsQuery.isLoading)return <PageSkeleton/>
  if(productsQuery.isError||teamsQuery.isError)return <main className="page"><ErrorState retry={()=>{void productsQuery.refetch();void teamsQuery.refetch()}}/></main>
  const products=productsQuery.data?.filter(product=>filter==='all'||categories[product.id]===filter)
  const pendingItems=cartQuery.data?.items.filter(item=>!item.status||item.status==='pending')||[]
  const cartCount=pendingItems.length
  return <main className="page">
    <div className="mb-5 flex items-start justify-between gap-3"><PageTitle eyebrow="HUB Store" title="Медиа для служения" description="Выберите то, что поможет команде"/><Link href={team?`/cart?team=${team.id}`:'/cart'} aria-label={`Корзина, товаров: ${cartCount}`} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-white/10 bg-[#1a1a20] text-white transition-colors hover:border-[#ff6a1f]/50"><ShoppingBag size={19}/>{cartCount>0&&<span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff6a1f] px-1 text-[10px] font-extrabold text-[#170a04]">{cartCount}</span>}</Link></div>
    {ownerTeams.length>0?<label className="mb-5 block rounded-[16px] border border-white/[.09] bg-[#131318] px-3.5 py-2.5"><span className="muted block text-[10px] font-bold uppercase tracking-wider">Покупка для команды</span><select value={team?.id||''} onChange={event=>setSelectedTeamId(event.target.value)} className="mt-1 min-h-8 w-full bg-transparent text-[13px] font-bold text-white focus:outline-none">{ownerTeams.map(item=><option key={item.id} value={item.id} className="bg-[#131318]">{item.name}</option>)}</select></label>:<p className="muted mb-5 text-xs">Добавлять товары в корзину может владелец команды.</p>}
    <div className="hide-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">{filters.map(([id,label])=><button key={id} type="button" onClick={()=>{setFilter(id);haptic()}} aria-pressed={filter===id} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors ${filter===id?'border-white bg-white text-[#111115]':'border-[#303038] bg-[#17171c] text-[#e7e7eb]'}`}>{label}</button>)}</div>
    {products?.length?<div className="grid grid-cols-2 gap-2.5">{products.map(product=>{
      const connected=team?team.subscriptions.some(subscription=>subscription.productId===product.id&&subscription.status==='active'):product.active
      return <ProductCard key={product.id} product={product} connected={connected} inCart={pendingItems.some(item=>item.productId===product.id)} teamId={team?.id} adding={add.isPending&&add.variables?.productId===product.id} onAdd={()=>{if(team)add.mutate({teamId:team.id,productId:product.id})}}/>
    })}</div>:<EmptyState title="Ничего не найдено" description="Попробуйте другой фильтр каталога."/>}
  </main>
}
