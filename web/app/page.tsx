'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Check, LifeBuoy, UsersRound } from 'lucide-react'
import { api } from '@/lib/api'
import type { Team, User } from '@/lib/types'
import { SubscriptionCard } from '@/components/subscription-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui'
export default function Dashboard(){
  const me=useQuery({queryKey:['me'],queryFn:()=>api<User>('/api/me')})
  const teams=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')})
  if(me.isLoading||teams.isLoading)return <PageSkeleton/>
  if(me.isError||teams.isError){const error=me.error||teams.error;return <main className="page"><ErrorState message={error instanceof Error?error.message:undefined} retry={()=>{me.refetch();teams.refetch()}}/></main>}
  const team=teams.data?.[0]
  const subscriptions=team?.subscriptions.filter(s=>s.status!=='none'&&s.status!=='rejected')||[]
  const featured=subscriptions.filter(s=>s.status==='active'&&s.daysLeft!==null).sort((a,b)=>(a.daysLeft??999)-(b.daysLeft??999))[0]
  const firstName=(me.data?.fio||me.data?.username||'друг').split(' ')[0]
  const progress=featured?.daysLeft===null?0:Math.min(100,Math.max(4,((featured?.daysLeft||0)/365)*100))
  return <main className="page">
    {team&&<Link href={`/teams/${team.id}`} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#15151a] px-3.5 py-2 text-xs font-bold"><UsersRound size={15} className="text-[#34d399]"/>{team.name}<ArrowUpRight size={13} className="muted"/></Link>}
    <h1 className="text-[26px] font-extrabold tracking-[-.04em]">Привет, {firstName} 👋</h1>
    <p className="muted mt-1 text-xs">Главное сначала: что нужно сделать сегодня</p>
    {featured?<section className="relative mt-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ff7525] via-[#ff641b] to-[#f84a08] p-5 text-[#180b05]"><div className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[30px] border-white/10"/><p className="text-[10px] font-extrabold uppercase tracking-[.12em]">Ближайшее продление</p><div className="relative mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="display-font truncate text-[18px] font-extrabold">{featured.productName}</h2><p className="mt-1 text-xs font-semibold">до {featured.expiresAt?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric'}).format(new Date(featured.expiresAt)):'—'}</p></div><div className="relative flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full" style={{background:`conic-gradient(#24100a ${progress}%, #c13f0c ${progress}% 100%)`}}><div className="flex h-[73px] w-[73px] flex-col items-center justify-center rounded-full bg-[#ff7425]"><strong className="display-font text-[23px] leading-none">{featured.daysLeft}</strong><span className="mt-1 text-[9px] font-bold uppercase">дней</span></div></div></div><Link href={`/catalog/${featured.productId}`} className="mt-3 inline-flex min-h-9 items-center rounded-xl bg-[#170d09] px-4 text-xs font-extrabold text-white">О подписке</Link></section>:<div className="card mt-5 flex items-center gap-3 p-5"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#34d399]/10 text-[#34d399]"><Check size={21}/></span><div><p className="font-extrabold">Всё в порядке</p><p className="muted mt-1 text-xs">Сейчас нет ближайших продлений</p></div></div>}
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Подписки</h2><Link href="/subscriptions" className="text-action text-xs">Все →</Link></div>{subscriptions.length?<div className="space-y-2.5">{subscriptions.slice(0,3).map(s=><SubscriptionCard key={s.productId} subscription={s}/>)}</div>:<EmptyState title="Подписок пока нет" description="Подберите медиаресурсы для вашей команды." action={<Link className="accent-button" href="/catalog">В каталог</Link>}/>}</section>
    <section className="mt-7 grid grid-cols-2 gap-3"><Link href="/teams" className="card flex items-center gap-3 p-4 text-sm font-bold"><UsersRound size={19} className="text-[#ff6a1f]"/>Команда</Link><Link href="/support" className="card flex items-center gap-3 p-4 text-sm font-bold"><LifeBuoy size={19} className="text-[#ff6a1f]"/>Помощь</Link></section>
  </main>
}
