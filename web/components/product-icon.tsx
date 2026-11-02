import { UsersRound } from 'lucide-react'

export function ProductIcon({id,name,size=48}:{id:string;name:string;size?:number}){
  const fontSize=Math.round(size*.31)
  const shared={width:size,height:size,fontSize}
  if(id==='propresenter')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-[#ff792d]" style={shared}><span className="h-[37%] w-[15%] rounded-[2px] bg-white"/></span>
  if(id==='procontent')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-[#9854f5] to-[#6c25cf] font-extrabold text-white" style={shared}>C</span>
  if(id==='cmg')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-black font-black italic tracking-[-.12em] text-[#f5c400]" style={{...shared,fontSize:Math.round(size*.28)}}>CMG</span>
  if(id==='storyloops')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-black" style={shared}><svg width="55%" height="55%" viewBox="0 0 32 32" fill="none"><path d="M4 15c3-7 6 7 9 0s6 7 9 0 5-4 6 0" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
  if(id==='sunday_screens')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-white font-black tracking-[-.07em] text-[#111115]" style={shared}>S<sup className="self-center text-[.55em]">1</sup></span>
  if(id==='cgs')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-[#eeede1] font-black tracking-[-.08em] text-[#0e4736]" style={{...shared,fontSize:Math.round(size*.27)}}>CGS</span>
  if(id==='add_member')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-[#183a32] text-[#34d399]" style={shared}><UsersRound size={Math.round(size*.45)}/></span>
  if(id==='yandex_360')return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-[#e44236] font-extrabold text-white" style={shared}>Я</span>
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-[15px] bg-[#28282e] font-extrabold text-white" style={shared}>{name.slice(0,1).toUpperCase()}</span>
}
