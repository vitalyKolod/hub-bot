'use client'
import { createContext, useCallback, useContext, useState } from 'react'
const ToastContext=createContext<(message:string)=>void>(()=>{})
export function ToastProvider({children}:{children:React.ReactNode}) { const [message,setMessage]=useState(''); const show=useCallback((value:string)=>{setMessage(value);window.setTimeout(()=>setMessage(''),2600)},[]); return <ToastContext.Provider value={show}>{children}{message&&<div role="status" className="fixed left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#242429] px-4 py-3 text-sm shadow-2xl" style={{bottom:'calc(92px + env(safe-area-inset-bottom))'}}>{message}</div>}</ToastContext.Provider> }
export const useToast=()=>useContext(ToastContext)
