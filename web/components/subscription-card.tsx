import Link from 'next/link'
import type { Subscription } from '@/lib/types'
import { ProductIcon } from './product-icon'
import { StatusBadge } from './status-badge'
export function SubscriptionCard({subscription}:{subscription:Subscription}){
  const progress=subscription.daysLeft===null?0:Math.min(100,Math.max(4,(subscription.daysLeft/365)*100))
  const date=subscription.expiresAt?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:'numeric'}).format(new Date(subscription.expiresAt)):'Дата не указана'
  return <Link href={`/catalog/${subscription.productId}`} className="card flex items-center gap-3 p-3.5 transition-colors hover:border-white/20"><ProductIcon id={subscription.productId} name={subscription.productName} size={48}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate text-[13px] font-extrabold">{subscription.productName}</h3><StatusBadge subscription={subscription}/></div><p className="muted mt-1 truncate text-[11px]">{subscription.flowNumber?`Поток ${subscription.flowNumber} · `:''}до {date}</p><div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#25252d]"><div className="h-full rounded-full bg-[#34d399]" style={{width:`${progress}%`}}/></div></div></Link>
}
