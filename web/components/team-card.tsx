import Link from 'next/link'
import { ChevronRight, MapPin, UsersRound } from 'lucide-react'
import type { Team } from '@/lib/types'
function noun(count:number,forms:[string,string,string]){const n=count%100;const last=n%10;return n>10&&n<20?forms[2]:last===1?forms[0]:last>=2&&last<=4?forms[1]:forms[2]}
export function TeamCard({team}:{team:Team}){
  const active=team.subscriptions.filter(s=>s.status==='active').length
  return <Link href={`/teams/${team.id}`} className="card block p-4 transition-colors hover:border-white/20"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#ff6a1f]/10 text-[#ff6a1f]"><UsersRound size={21}/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#ff6a1f]">{team.viewerRole==='owner'?'Владелец':'Участник'}</p><h3 className="mt-1 truncate text-[15px] font-extrabold">{team.name}</h3><p className="muted mt-1 flex items-center gap-1 text-xs"><MapPin size={12}/>{team.city||team.church||'Город не указан'}</p></div><ChevronRight className="muted mt-3 shrink-0" size={18}/></div><div className="muted mt-4 flex gap-4 border-t border-white/[.06] pt-3 text-[11px]"><span>{team.membersCount} {noun(team.membersCount,['участник','участника','участников'])}</span><span>{active} {noun(active,['подписка','подписки','подписок'])}</span></div></Link>
}
