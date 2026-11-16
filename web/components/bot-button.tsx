'use client'
import { useState } from 'react'
import { telegramWebApp } from '@/lib/telegram'
export function BotButton({label}:{label:string}){
  const [browserNotice,setBrowserNotice]=useState(false)
  return <div><button type="button" className="accent-button w-full" onClick={()=>{const app=telegramWebApp();if(app)app.close();else setBrowserNotice(true)}}>{label}</button>{browserNotice&&<p className="muted mt-2 text-xs">Откройте HUB в Telegram, чтобы продолжить в боте.</p>}</div>
}
