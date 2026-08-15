import { useState } from 'react'
import { Wallet, Loader2, ChevronDown, LogOut, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWalletStore } from '@/stores/walletStore'
import { useWallet } from '@/hooks/useWallet'
import { shortenAddress } from '@/lib/money'
import { getExplorerAccountUrl } from '@/config/env'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface WalletButtonProps {
  compact?: boolean
}

export function WalletButton({ compact = false }: WalletButtonProps) {
  const { status, publicKey, network } = useWalletStore()
  const { connect, disconnect } = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  if (status === 'connecting') {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        {!compact && 'Connecting…'}
      </Button>
    )
  }

  if (status === 'connected' && publicKey) {
    return (
      <>
        <button
          onClick={() => setMenuOpen(true)}
          className={cn(
            'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2',
            'text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          )}
          aria-label="Wallet menu"
          aria-expanded={menuOpen}
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="font-mono text-xs">{shortenAddress(publicKey, 4, 4)}</span>
          {!compact && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-400 capitalize">{network}</span>
            </>
          )}
          <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
        </button>

        {/* Wallet menu dialog */}
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Connected Wallet</DialogTitle>
              <DialogDescription>Freighter · Stellar {network}</DialogDescription>
            </DialogHeader>

            <div className="rounded-xl bg-slate-50 p-4 space-y-1">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Address</p>
              <p className="font-mono text-xs text-slate-700 break-all">{publicKey}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-sm text-slate-600 capitalize">{network} · Connected</span>
            </div>

            <DialogFooter>
              <a
                href={getExplorerAccountUrl(publicKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View on Explorer
              </a>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setMenuOpen(false); setConfirmDisconnect(true) }}
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm disconnect */}
        <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Disconnect wallet?</DialogTitle>
              <DialogDescription>
                You will need to reconnect Freighter to make payments.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { disconnect(); setConfirmDisconnect(false) }}>
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Button size="sm" onClick={connect} className="gap-1.5">
      <Wallet className="h-4 w-4" aria-hidden="true" />
      {compact ? '' : 'Connect Wallet'}
    </Button>
  )
}
