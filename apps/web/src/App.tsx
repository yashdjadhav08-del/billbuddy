import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { HouseholdPage } from '@/pages/HouseholdPage'
import { CreateBillPage } from '@/pages/CreateBillPage'
import { BillDetailsPage } from '@/pages/BillDetailsPage'
import { SettlementPage } from '@/pages/SettlementPage'
import { MonthlyClosePage } from '@/pages/MonthlyClosePage'
import { config } from '@/config/env'
import { useAppStore } from '@/stores/appStore'
import { DEMO_ADDRESSES } from '@/services/mockData'
import { mockServerApi } from '@/services/mockServerClient'

export default function App() {
  // On load: recompute balances/transfers (they are not persisted). In mock
  // mode the shared state server is the single source of truth, so we pull the
  // household/bills/settlements from the server (visible to EVERY account) and
  // apply them to the local store. We also clear any leftover fake demo fixture
  // so only households built from real user wallets ever show.
  useEffect(() => {
    const state = useAppStore.getState()
    state.recomputeBalances()

    if (!config.flags.mockMode) return
    const hh = state.household
    if (hh && Object.values(DEMO_ADDRESSES).includes(hh.owner as never)) {
      state.reset()
    }

    // Sync from the shared server so every user sees the same live data.
    // If the server is down we keep whatever is in the local store.
    mockServerApi
      .getState()
      .then((server) => {
        useAppStore.setState({
          household: server.household,
          bills: server.bills,
          settlements: server.settlements,
        })
        useAppStore.getState().recomputeBalances()
      })
      .catch(() => {
        // Server offline: fall back to local persisted state.
      })
  }, [])

  return (
    <Routes>
      {/* Public landing */}
      <Route path="/" element={<LandingPage />} />

      {/* App shell with persistent nav */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/household" element={<HouseholdPage />} />
        <Route path="/bills/new" element={<CreateBillPage />} />
        <Route path="/bills/:billId" element={<BillDetailsPage />} />
        <Route path="/settlements" element={<SettlementPage />} />
        <Route path="/close" element={<MonthlyClosePage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
