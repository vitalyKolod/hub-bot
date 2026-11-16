'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import type { Cart, Product, Team } from '@/lib/types'
import { ProductIcon } from '@/components/product-icon'
import { BotButton } from '@/components/bot-button'
import { useToast } from '@/components/toast'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'

function CartContent(){
  const params=useSearchParams()
  const [selectedTeamId,setSelectedTeamId]=useState('')
  const queryClient=useQueryClient()
  const toast=useToast()
  const teamsQuery=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  const productsQuery=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')})
  const teams=(teamsQuery.data||[]).filter(team=>team.viewerRole==='owner')
  const team=teams.find(item=>item.id===(selectedTeamId||params.get('team')))||teams[0]
  const cartQuery=useQuery({queryKey:['cart',team?.id],queryFn:()=>api<Cart>(`/api/teams/${team!.id}/cart`),enabled:Boolean(team)})
  const remove=useMutation({
    mutationFn:({teamId,itemId}:{teamId:string;itemId:string})=>api<Cart>(`/api/teams/${teamId}/cart/items/${itemId}`,{method:'DELETE'}),
    onSuccess:(cart,variables)=>{queryClient.setQueryData(['cart',variables.teamId],cart);haptic('success');toast('Товар удалён из корзины')},
    onError:(error)=>toast(error instanceof Error?error.message:'Не удалось удалить товар'),
  })

  if(teamsQuery.isLoading)return <PageSkeleton/>
  if(teamsQuery.isError)return <main className="page"><ErrorState retry={()=>teamsQuery.refetch()}/></main>

  const pendingItems=(cartQuery.data?.items||[]).filter(item=>!item.status||item.status==='pending')
  const totalRub=cartQuery.data?.totalRub??pendingItems.reduce((sum,item)=>sum+(item.priceRub??0),0)
  const productName=(item:Cart['items'][number])=>item.productName||productsQuery.data?.find(product=>product.id===item.productId)?.name||item.productId

  return <main className="page">
    <Link href="/catalog" className="muted mb-5 inline-flex min-h-10 items-center gap-2 text-xs font-bold hover:text-white"><ArrowLeft size={16}/>Каталог</Link>
    <PageTitle eyebrow="Ваши покупки" title="Корзина" description="Товары сохраняются для выбранной команды"/>
    {teams.length===0?<EmptyState title="Корзина недоступна" description="Добавлять товары может владелец команды." action={<Link href="/catalog" className="secondary-button">Перейти в каталог</Link>}/>:<>
      <label className="mb-5 block rounded-[16px] border border-white/[.09] bg-[#131318] px-3.5 py-2.5"><span className="muted block text-[10px] font-bold uppercase tracking-wider">Команда</span><select value={team?.id||''} onChange={event=>setSelectedTeamId(event.target.value)} className="mt-1 min-h-8 w-full bg-transparent text-[13px] font-bold text-white focus:outline-none">{teams.map(item=><option key={item.id} value={item.id} className="bg-[#131318]">{item.name}</option>)}</select></label>
      {cartQuery.isLoading?<PageSkeleton/>:cartQuery.isError?<ErrorState retry={()=>cartQuery.refetch()}/>:pendingItems.length===0?<EmptyState title="Корзина пока пуста" description="Добавьте подписки из каталога." action={<Link href="/catalog" className="secondary-button"><ShoppingBag size={16}/>Открыть каталог</Link>}/>:<>
        <div className="space-y-2.5">{pendingItems.map(item=><div key={item.id} className="card flex items-center gap-3 p-3.5"><ProductIcon id={item.productId} name={productName(item)} size={44}/><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-extrabold">{productName(item)}</p><p className="muted mt-1 text-xs">{item.priceRub===null?'Цена уточняется':`${item.priceRub.toLocaleString('ru-RU')} ₽`}</p></div><button type="button" aria-label={`Удалить ${productName(item)} из корзины`} disabled={remove.isPending} onClick={()=>remove.mutate({teamId:team!.id,itemId:item.id})} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#a2a2ad] transition-colors hover:bg-white/[.06] hover:text-white disabled:opacity-50"><Trash2 size={17}/></button></div>)}</div>
        <div className="card mt-5 p-4"><div className="mb-4 flex items-center justify-between gap-3"><span className="muted text-sm">Итого</span><strong className="display-font text-lg">{totalRub.toLocaleString('ru-RU')} ₽</strong></div><BotButton label="Оформить в боте"/><p className="muted mt-3 text-center text-[11px] leading-5">Заказ и оплата завершаются в Telegram-боте.</p></div>
      </>}
    </>}
  </main>
}

export default function CartPage(){return <Suspense fallback={<PageSkeleton/>}><CartContent/></Suspense>}
