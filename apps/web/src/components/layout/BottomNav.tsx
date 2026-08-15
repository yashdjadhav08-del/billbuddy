import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Receipt, ArrowLeftRight, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',   label: 'Home',       Icon: LayoutDashboard },
  { to: '/household',   label: 'Members',    Icon: Users            },
  { to: '/bills/new',   label: 'Add Bill',   Icon: Receipt          },
  { to: '/settlements', label: 'Settle',     Icon: ArrowLeftRight   },
  { to: '/close',       label: 'Close',      Icon: CalendarCheck    },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-100 bg-white/95 backdrop-blur-md"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex max-w-lg">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500',
                isActive
                  ? 'text-indigo-600'
                  : 'text-slate-400 hover:text-slate-600',
              )
            }
            aria-label={label}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
                    isActive && 'bg-indigo-50',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
