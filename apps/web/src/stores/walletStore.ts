import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WalletState, NetworkType } from '@/types'

interface WalletActions {
  setConnecting: () => void
  setConnected: (publicKey: string, network: NetworkType) => void
  setDisconnected: () => void
  setError: (error: string) => void
}

const initial: WalletState = {
  status: 'disconnected',
  publicKey: null,
  network: null,
  error: null,
}

export const useWalletStore = create<WalletState & WalletActions>()(
  persist(
    set => ({
      ...initial,

      setConnecting: () =>
        set({ status: 'connecting', error: null }),

      setConnected: (publicKey, network) =>
        set({ status: 'connected', publicKey, network, error: null }),

      setDisconnected: () =>
        set({ ...initial }),

      setError: (error) =>
        set({ status: 'error', error }),
    }),
    {
      name: 'billbuddy-wallet',
      // Only persist the public key — never the status (reconnect on load)
      partialize: state => ({ publicKey: state.publicKey, network: state.network }),
    },
  ),
)
