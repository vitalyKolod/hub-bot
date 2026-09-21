'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Script from 'next/script'
import { useState } from 'react'
import { ToastProvider } from './toast'
import { initializeTelegramWebApp, telegramWebApp } from '@/lib/telegram'

export function Providers({children}:{children:React.ReactNode}) {
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}}))
  const loadTelegramSdk=process.env.NODE_ENV==='production'||process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH!=='true'
  const initializeTelegram=()=>{
    const telegram=telegramWebApp()
    console.info('[HUB Telegram] SDK ready',{loaded:Boolean(telegram),version:telegram?.version||'unknown',platform:telegram?.platform||'unknown',hasInitData:Boolean(telegram?.initData)})
    initializeTelegramWebApp()
    window.dispatchEvent(new Event('telegram-webapp-ready'))
    void client.refetchQueries({type:'active'})
  }
  return <>{loadTelegramSdk&&<Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="afterInteractive" onReady={initializeTelegram}/>}<QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider></>
}
