import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = { title: 'HUB', description: 'Подписки, ресурсы и поддержка вашей команды', icons: { icon: '/hub-icon.svg' }, manifest: '/manifest.webmanifest' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0B0B0D' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body suppressHydrationWarning><Providers><AppShell>{children}</AppShell></Providers></body></html>
}
