'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, UsersRound } from 'lucide-react'
import { api } from '@/lib/api'
import type { Subscription, Team } from '@/lib/types'
import { ProductIcon } from '@/components/product-icon'
import { presentationStatus } from '@/components/status-badge'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui'

function SubscriptionRow({subscription}:{subscription:Subscription}){
  const status=presentationStatus(subscription)
  const date=subscription.expiresAt?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:'numeric'}).format(new Date(subscription.expiresAt)):null
  const statusColor=status.className.split(' ').find(value=>value.startsWith('text-'))||''
  return <Link href={`/catalog/${subscription.productId}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff6a1f]">
    <ProductIcon id={subscription.productId} name={subscription.productName} size={36}/>
    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{subscription.productName}</span><span className="muted mt-0.5 block truncate text-[11px]">{subscription.flowNumber?`Поток ${subscription.flowNumber} · `:''}{date?`до ${date}`:'Срок не указан'}</span></span>
    <span className={`shrink-0 text-[10px] font-semibold ${statusColor}`}><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"/>{status.label}</span>
    <ChevronRight aria-hidden="true" size={15} className="shrink-0 text-[#777783]"/>
  </Link>
}

export default function SubscriptionsPage(){
  const query=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  if(query.isLoading)return <PageSkeleton/>
  if(query.isError)return <main className="page"><ErrorState retry={()=>query.refetch()}/></main>
  const groups=(query.data||[]).map(team=>({team,subscriptions:team.subscriptions.filter(s=>s.status!=='none')}))
  const activeCount=groups.reduce((count,group)=>count+group.subscriptions.filter(s=>s.status==='active').length,0)
  return <main className="page">
    <header className="mb-6"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#ff6a1f]">Ваши ресурсы</p><h1 className="text-[28px] font-extrabold tracking-tight">Подписки</h1><p className="muted mt-1 text-[12px]">Активных: {activeCount} · Команд: {groups.length}</p></header>
    {groups.length?<div className="space-y-2.5">{groups.map(({team,subscriptions})=>{
      const active=subscriptions.filter(s=>s.status==='active').length
      return <details key={team.id} className="group overflow-hidden rounded-[20px] border border-white/[.09] bg-[#131318] open:border-white/[.16]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff6a1f] [&::-webkit-details-marker]:hidden">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#ff6a1f]/10 text-[#ff6a1f]"><UsersRound size={19}/></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-extrabold">{team.name}</span><span className="muted mt-0.5 block text-[11px]">{subscriptions.length?`Активных: ${active} из ${subscriptions.length}`:'Подписок пока нет'}</span></span>
          <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-[#858590] transition-transform group-open:rotate-180"/>
        </summary>
        <div className="divide-y divide-white/[.06] border-t border-white/[.07]">{subscriptions.length?subscriptions.map(subscription=><SubscriptionRow key={subscription.productId} subscription={subscription}/>):<p className="muted px-4 py-4 text-xs">Подписок пока нет. Выберите продукт в каталоге.</p>}</div>
        <Link href={`/teams/${team.id}`} className="flex items-center justify-between border-t border-white/[.07] px-4 py-3 text-[11px] font-bold text-[#ff874c] transition-colors hover:bg-white/[.04]">О команде<ChevronRight size={14}/></Link>
      </details>
    })}</div>:<EmptyState title="Подписок пока нет" description="Выберите продукт для вашей команды в каталоге."/>}
    <Link href="/catalog" className="secondary-button mt-5 w-full"><Plus size={17}/>Выбрать подписку</Link>
  </main>
}
