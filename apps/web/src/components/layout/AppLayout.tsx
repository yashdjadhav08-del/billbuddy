import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { useDiscovery } from '@/hooks/useDiscovery'

export function AppLayout() {
  useDiscovery()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />
      <main
        id="main-content"
        className="flex-1 w-full max-w-lg mx-auto px-4 pt-4 pb-28"
        role="main"
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
