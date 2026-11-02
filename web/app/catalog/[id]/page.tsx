'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Plus, ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import type { Cart, Product, Team } from '@/lib/types'
import { BotButton } from '@/components/bot-button'
import { ProductIcon } from '@/components/product-icon'
import { useToast } from '@/components/toast'
import { ErrorState, PageSkeleton } from '@/components/ui'
export default function ProductPage(){
  const {id}=useParams<{id:string}>()
  const [selectedTeamId,setSelectedTeamId]=useState('')
  const queryClient=useQueryClient()
  const toast=useToast()
  const query=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')})
  const teamsQuery=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  const teams=(teamsQuery.data||[]).filter(team=>team.viewerRole==='owner')
  const team=teams.find(item=>item.id===selectedTeamId)||teams[0]
  const cartQuery=useQuery({queryKey:['cart',team?.id],queryFn:()=>api<Cart>(`/api/teams/${team!.id}/cart`),enabled:Boolean(team)})
  const add=useMutation({
    mutationFn:({teamId,productId}:{teamId:string;productId:string})=>api<Cart>(`/api/teams/${teamId}/cart/items`,{method:'POST',body:JSON.stringify({productId})}),
    onSuccess:(cart,variables)=>{queryClient.setQueryData(['cart',variables.teamId],cart);haptic('success');toast('Товар добавлен в корзину')},
    onError:(error)=>toast(error instanceof Error?error.message:'Не удалось добавить товар'),
  })
  if(query.isLoading||teamsQuery.isLoading)return <PageSkeleton/>
  const product=query.data?.find(item=>item.id===id)
  if(query.isError||teamsQuery.isError||!product)return <main className="page"><ErrorState retry={()=>{void query.refetch();void teamsQuery.refetch()}}/></main>
  const connected=team?team.subscriptions.some(subscription=>subscription.productId===id&&subscription.status==='active'):product.active
  const inCart=Boolean(cartQuery.data?.items.some(item=>item.productId===id&&(!item.status||item.status==='pending')))
  return <main className="page"><Link href="/catalog" className="muted mb-4 inline-flex min-h-10 items-center gap-1.5 text-xs font-bold"><ArrowLeft size={15}/>Каталог</Link><div className="card flex items-center gap-4 p-5"><ProductIcon id={product.id} name={product.name} size={76}/><div className="min-w-0"><p className="eyebrow">Продукт HUB</p><h1 className="mt-2 text-[24px] font-extrabold leading-tight">{product.name}</h1></div></div>{connected&&<span className="mt-5 inline-flex items-center gap-1 rounded-full border border-[#34d399]/25 bg-[#34d399]/10 px-2.5 py-1.5 text-[10px] font-bold text-[#34d399]"><CheckCircle2 size={13}/>Подключена</span>}<p className="muted mt-4 text-sm leading-6">{product.description}</p><div className="card mt-6 p-5"><p className="muted text-xs">Стоимость подписки</p><p className="display-font mt-1 text-xl font-bold">{product.priceRub===null?'По запросу':`${product.priceRub.toLocaleString('ru-RU')} ₽`}</p>{product.cartable&&teams.length>0&&!connected?<><label className="mt-5 block"><span className="muted text-xs">Для команды</span><select value={team?.id||''} onChange={event=>setSelectedTeamId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#1a1a20] px-3 text-xs font-bold text-white">{teams.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{inCart?<Link href={`/cart?team=${team!.id}`} className="secondary-button mt-4 w-full text-[#ff874c]"><ShoppingBag size={17}/>В корзине</Link>:<button type="button" disabled={add.isPending||!team} onClick={()=>{if(team)add.mutate({teamId:team.id,productId:id})}} className="accent-button mt-4 w-full"><Plus size={18}/>{add.isPending?'Добавляем…':'Добавить в корзину'}</button>}</>:<><p className="muted mt-3 text-xs leading-5">{connected?'Продление доступно в Telegram-боте HUB.':product.cartable?'Создайте команду в боте, чтобы подключить продукт.':'Оформление доступно в Telegram-боте HUB.'}</p><div className="mt-5"><BotButton label={connected?'Продлить в боте':product.priceRub===null?'Уточнить в боте':'Подключить в боте'}/></div></>}</div></main>
}
