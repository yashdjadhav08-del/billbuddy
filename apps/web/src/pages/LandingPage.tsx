import { useNavigate } from 'react-router-dom'
import { ArrowRight, Wallet, Receipt, Zap, Shield, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalletButton } from '@/components/wallet/WalletButton'
import { useWalletStore } from '@/stores/walletStore'
import { useAppStore } from '@/stores/appStore'

const features = [
  { icon: Receipt, title: 'Track every bill', desc: 'Rent, utilities, groceries — one place for all shared expenses.' },
  { icon: Zap,     title: 'Auto-calculate',  desc: 'Net balances computed instantly. No spreadsheets.' },
  { icon: Wallet,  title: 'Settle on-chain', desc: 'Real Stellar payments signed by your Freighter wallet.' },
  { icon: Shield,  title: 'Trustless',       desc: 'Settlement logic lives in a Soroban smart contract.' },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { status } = useWalletStore()
  const { household } = useAppStore()

  function handleGetStarted() {
    if (household) {
      navigate('/dashboard')
    } else {
      navigate('/household')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 bg-indigo-950/80 backdrop-blur-md border-b border-indigo-800/40">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white text-sm font-bold">
            $
          </span>
          <span className="font-semibold text-white">BillBuddy</span>
        </div>
        <WalletButton />
      </header>

      {/* Hero */}
      <section className="px-5 pt-20 pb-16 text-center max-w-lg mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-800/60 px-4 py-1.5 text-xs font-medium text-indigo-200 mb-8 border border-indigo-700/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live on Stellar Testnet
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight leading-tight mb-4">
          Split bills.<br />
          <span className="text-indigo-300">Settle simply.</span>
        </h1>

        <p className="text-indigo-200/80 text-lg leading-relaxed mb-10 max-w-sm mx-auto">
          Track household expenses, calculate balances automatically,
          and settle with real Stellar payments.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold gap-2 w-full sm:w-auto"
            onClick={handleGetStarted}
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
          {status !== 'connected' && (
            <Button
              size="lg"
              variant="outline"
              className="border-indigo-600 text-indigo-200 bg-transparent hover:bg-indigo-800/40 w-full sm:w-auto gap-2"
              onClick={() => {/* wallet connect handled by WalletButton */}}
            >
              <Wallet className="h-4 w-4" />
              Connect Freighter
            </Button>
          )}
        </div>
      </section>

      {/* Example card */}
      <section className="px-5 pb-16 max-w-sm mx-auto">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
          <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-4">
            August 2026 · Apartment 204
          </p>
          {[
            { label: 'Rent',        amount: '$800', status: '✓', color: 'text-emerald-400' },
            { label: 'Electricity', amount: '$72',  status: '✓', color: 'text-emerald-400' },
            { label: 'Internet',    amount: '$30',  status: '⏳', color: 'text-amber-400'  },
            { label: 'Water',       amount: '$28',  status: '✓', color: 'text-emerald-400' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
              <span className="text-sm text-white/80">{row.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-white">{row.amount}</span>
                <span className={`text-sm ${row.color}`}>{row.status}</span>
              </div>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-white/10 flex justify-between">
            <span className="text-sm font-medium text-white/60">Total</span>
            <span className="font-mono font-bold text-white">$930</span>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-5 pb-16 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/40">
                <Icon className="h-5 w-5 text-indigo-300" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
              <p className="text-xs text-indigo-200/60 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Blockchain callout */}
      <section className="px-5 pb-20 max-w-lg mx-auto">
        <div className="rounded-2xl bg-indigo-800/30 border border-indigo-700/40 p-5">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            How the blockchain fits in
          </h3>
          <div className="space-y-2.5">
            {[
              'Household & bill state stored in a Soroban smart contract',
              'Payments move real XLM on Stellar Testnet',
              'Every settlement has a verifiable transaction hash',
              'Contract events confirm SettlementCompleted on-chain',
            ].map(item => (
              <div key={item} className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-indigo-200/80">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center pb-8 text-xs text-indigo-400/60">
        BillBuddy · Stellar Testnet · Not for production use
      </footer>
    </div>
  )
}
