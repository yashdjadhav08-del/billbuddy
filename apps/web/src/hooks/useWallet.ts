import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { useWalletStore } from '@/stores/walletStore'
import { walletService } from '@/services/walletService'
import type { NetworkType } from '@/types'

export function useWallet() {
  const { setConnecting, setConnected, setDisconnected, setError, publicKey, status } =
    useWalletStore()

  const connect = useCallback(async () => {
    setConnecting()
    try {
      const result = await walletService.connect()
      setConnected(result.publicKey, result.network as NetworkType)
      toast.success('Wallet connected')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(msg)
      toast.error(msg)
    }
  }, [setConnecting, setConnected, setError])

  const disconnect = useCallback(() => {
    setDisconnected()
    toast('Wallet disconnected', { icon: '👋' })
  }, [setDisconnected])

  const requireWallet = useCallback((): string => {
    if (status !== 'connected' || !publicKey) {
      throw new Error('Please connect your Freighter wallet first.')
    }
    return publicKey
  }, [status, publicKey])

  return {
    connect,
    disconnect,
    requireWallet,
    publicKey,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
  }
}
