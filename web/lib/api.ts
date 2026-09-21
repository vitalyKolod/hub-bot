import { authHeader } from './telegram'

type Envelope<T> = { data:T }
export async function api<T>(path:string, init?:RequestInit):Promise<T> {
  const method=init?.method||'GET'
  console.info(`[HUB API] ${method} ${path} → start`)
  let authorization:string
  try { authorization=authHeader() }
  catch(error) { console.error(`[HUB API] ${method} ${path} → auth unavailable`,error); throw error }
  const response=await fetch(path,{...init,headers:{'content-type':'application/json',authorization,...init?.headers}})
  const body=await response.json().catch(()=>({}))
  console.info(`[HUB API] ${method} ${path} → ${response.status}`,{code:body?.error?.code||null})
  if(!response.ok) throw new Error(`${body?.error?.message||'Не удалось выполнить запрос'} [HTTP ${response.status}${body?.error?.code?`, ${body.error.code}`:''}]`)
  return (body as Envelope<T>).data
}
