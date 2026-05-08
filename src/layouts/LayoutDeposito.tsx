import { Outlet } from 'react-router-dom'
import { DepositoSidebar } from '../components/deposito/DepositoSidebar'

export function LayoutDeposito() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
      <DepositoSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
