'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Headphones, House, Layers3, LayoutGrid, MoreHorizontal, ShoppingBag, UsersRound } from 'lucide-react'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { haptic, initializeTelegramWebApp, telegramWebApp } from '@/lib/telegram'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'

const nav=[['/','Главная',House],['/subscriptions','Подписки',Layers3],['/catalog','Каталог',LayoutGrid],['/teams','Команда',UsersRound],['/more','Ещё',MoreHorizontal]] as const
export function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname(); const router=useRouter()
  const me=useQuery({queryKey:['me'],queryFn:()=>api<User>('/api/me')})
  const initials=(me.data?.fio||me.data?.username||'H').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()
  useEffect(()=>{initializeTelegramWebApp()},[])
  useEffect(()=>{const tg=telegramWebApp();if(!tg)return;try{if(!tg.isVersionAtLeast('6.1'))return}catch{return}const root=nav.some(([href])=>href===pathname);const back=()=>router.back();try{if(!root){tg.BackButton.show();tg.BackButton.onClick(back)}else tg.BackButton.hide()}catch{return}return()=>{try{tg.BackButton.offClick(back)}catch{/* Unsupported clients are a no-op. */}}},[pathname,router])
  return <div className="mx-auto min-h-dvh max-w-[600px] border-x border-white/[.035]"><header className="flex items-center justify-between px-5 pb-2 pt-[calc(25px+env(safe-area-inset-top))]"><Link href="/" className="display-font text-lg font-extrabold tracking-[-.08em]" aria-label="HUB — главная">HUB<span className="text-[#ff6a1f]">.</span></Link><div className="flex items-center gap-2"><Link href="/cart" aria-label="Корзина" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#1a1a20] text-[#d2d2d8] transition-colors hover:border-[#ff6a1f]/40 hover:text-[#ff6a1f]"><ShoppingBag size={18} strokeWidth={1.9}/></Link><Link href="/profile" aria-label="Профиль" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#1a1a20] text-xs font-extrabold text-[#ff6a1f]">{initials}</Link><Link href="/support" aria-label="Поддержка" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ff6a1f]/30 bg-[#ff6a1f]/10 text-[#ff6a1f]"><Headphones size={19} strokeWidth={2}/></Link></div></header>{children}<nav aria-label="Основная навигация" className="fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-1/2 z-40 grid w-[calc(100%-24px)] max-w-[576px] -translate-x-1/2 grid-cols-5 rounded-[24px] border border-white/10 bg-[#1b1b22]/90 p-1.5 shadow-[0_15px_50px_rgba(0,0,0,.55)] backdrop-blur-2xl">{nav.map(([href,label,Icon])=>{const active=href==='/'?pathname===href:pathname.startsWith(href)||(href==='/catalog'&&pathname.startsWith('/cart'))||(href==='/more'&&['/profile','/support'].some(path=>pathname.startsWith(path)));return <Link key={href} href={href} aria-current={active?'page':undefined} onClick={()=>haptic()} className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] text-[9px] font-semibold transition-colors ${active?'bg-[#ff6a1f]/10 text-[#ff6a1f]':'text-[#92929d] hover:text-white'}`}><Icon size={21} strokeWidth={active?2.25:1.8}/><span>{label}</span></Link>})}</nav></div>
}
