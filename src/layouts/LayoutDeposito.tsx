import { Outlet } from 'react-router-dom'
import { DepositoSidebar } from '../components/deposito/DepositoSidebar'
import { PanelTopBar } from '../components/PanelTopBar'

export function LayoutDeposito() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 md:flex-row">
      <DepositoSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PanelTopBar titulo="Panel de Depósito" />
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
