import { useAppStore } from '@/stores/appStore'
import { WalletButton } from '@/components/wallet/WalletButton'
import { Link } from 'react-router-dom'

export function TopBar() {
  const household = useAppStore(s => s.household)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 h-14">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
          aria-label="BillBuddy home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white text-sm font-bold select-none">
            $
          </span>
          <span className="font-semibold text-slate-800 text-sm hidden sm:block">BillBuddy</span>
        </Link>

        {household && (
          <span className="text-sm font-medium text-slate-600 truncate max-w-[140px]">
            {household.name}
          </span>
        )}

        <WalletButton compact />
      </div>
    </header>
  )
}
