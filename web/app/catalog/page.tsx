'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Product } from '@/lib/types'
import { ProductCard } from '@/components/product-card'
import { EmptyState, ErrorState, PageSkeleton, PageTitle } from '@/components/ui'
export default function CatalogPage(){const query=useQuery({queryKey:['products'],queryFn:()=>api<Product[]>('/api/products')});if(query.isLoading)return <PageSkeleton/>;return <main className="page"><PageTitle eyebrow="HUB Store" title="Каталог" description="Медиаресурсы и инструменты для церковной команды."/>{query.isError?<ErrorState retry={()=>query.refetch()}/>:query.data?.length?<div className="grid grid-cols-2 gap-3">{query.data.map(product=><ProductCard key={product.id} product={product}/>)}</div>:<EmptyState title="Каталог пуст" description="Продукты появятся здесь после настройки на сервере."/>}</main>}
