import { Outlet } from 'react-router-dom'
import { CampamentoSidebar } from '../components/campamento/CampamentoSidebar'
import { JefeCampamentoModuleSwitcher } from '../components/campamento/JefeCampamentoModuleSwitcher'

export function LayoutCampamento() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <JefeCampamentoModuleSwitcher />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CampamentoSidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
