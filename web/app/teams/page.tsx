'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Team } from '@/lib/types'
import { TeamCard } from '@/components/team-card'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'
export default function TeamsPage(){const query=useQuery({queryKey:['teams'],queryFn:()=>api<Team[]>('/api/teams')});if(query.isLoading)return <PageSkeleton/>;return <main className="page"><PageTitle eyebrow="Команды" title="Мои команды" description="Подписки и участники ваших церковных медиакоманд."/>{query.isError?<ErrorState retry={()=>query.refetch()}/>:query.data?.length?<div className="space-y-3">{query.data.map(team=><TeamCard key={team.id} team={team}/>)}</div>:<EmptyState title="Команд пока нет" description="Создать команду можно в Telegram-боте HUB."/>}</main>}
