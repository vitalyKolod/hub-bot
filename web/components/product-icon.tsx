import Image from 'next/image'
export function ProductIcon({cover,name,size=48}:{cover?:string;name:string;size?:number}) {
  return <span className="relative inline-flex shrink-0 overflow-hidden rounded-[15px] bg-[#202027]" style={{width:size,height:size}}>{cover?<Image src={cover} alt="" fill className="object-cover" sizes={`${size}px`}/>:<span className="flex h-full w-full items-center justify-center text-sm font-extrabold text-[#ff6a1f]">{name.slice(0,1)}</span>}</span>
}
