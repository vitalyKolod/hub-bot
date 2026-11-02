'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Team } from '@/lib/types'
import { SubscriptionCard } from '@/components/subscription-card'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'
export default function SubscriptionsPage(){
  const query=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  if(query.isLoading)return <PageSkeleton/>
  if(query.isError)return <main className="page"><ErrorState retry={()=>query.refetch()}/></main>
  const groups=(query.data||[]).map(team=>({team,subscriptions:team.subscriptions.filter(s=>s.status!=='none'&&s.status!=='rejected')})).filter(group=>group.subscriptions.length)
  const activeCount=groups.reduce((count,group)=>count+group.subscriptions.filter(s=>s.status==='active').length,0)
  return <main className="page"><PageTitle eyebrow="Ваши ресурсы" title="Подписки" description={`${activeCount} активных подписок`}/>{groups.length?<div className="space-y-6">{groups.map(({team,subscriptions})=><section key={team.id}><h2 className="muted mb-2 ml-1 text-xs font-bold">{team.name}</h2><div className="space-y-2.5">{subscriptions.map(subscription=><SubscriptionCard key={subscription.productId} subscription={subscription}/>)}</div></section>)}</div>:<EmptyState title="Подписок пока нет" description="Выберите продукт для вашей команды в каталоге."/>}<Link href="/catalog" className="secondary-button mt-4 w-full"><Plus size={17}/>Выбрать подписку</Link></main>
}
