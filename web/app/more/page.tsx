'use client'
import Link from 'next/link'
import { ChevronRight, CircleHelp, CreditCard, Headphones, Monitor, RotateCw, Settings2, UserRound } from 'lucide-react'
import { telegramWebApp } from '@/lib/telegram'
import { PageTitle } from '@/components/ui'
const botItems=[{label:'Устройства',Icon:Monitor},{label:'Продления',Icon:RotateCw},{label:'Оплата',Icon:CreditCard},{label:'Настройки',Icon:Settings2}]
export default function MorePage(){
  return <main className="page"><PageTitle eyebrow="HUB" title="Ещё" description="Управление аккаунтом и помощь"/><div className="card overflow-hidden divide-y divide-white/[.06]"><Link href="/profile" className="flex min-h-16 items-center gap-4 px-4"><UserRound size={20} className="text-[#ff6a1f]"/><span className="flex-1 text-sm font-bold">Профиль</span><ChevronRight size={17} className="muted"/></Link><Link href="/support" className="flex min-h-16 items-center gap-4 px-4"><Headphones size={20} className="text-[#ff6a1f]"/><span className="flex-1 text-sm font-bold">Поддержка</span><ChevronRight size={17} className="muted"/></Link></div><p className="muted mb-3 mt-7 text-xs font-semibold">В Telegram-боте</p><div className="card overflow-hidden divide-y divide-white/[.06]">{botItems.map(({label,Icon})=><button key={label} onClick={()=>telegramWebApp()?.close()} className="flex min-h-16 w-full items-center gap-4 px-4 text-left"><Icon size={20} className="text-[#ff6a1f]"/><span className="flex-1 text-sm font-bold">{label}</span><ChevronRight size={17} className="muted"/></button>)}</div><div className="card mt-6 flex gap-3 p-4"><CircleHelp size={21} className="shrink-0 text-[#ff6a1f]"/><p className="muted text-xs leading-5">Эти разделы пока работают в боте. Нажмите на пункт, чтобы вернуться к переписке с HUB.</p></div></main>
}
