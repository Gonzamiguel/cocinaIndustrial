import { Outlet } from 'react-router-dom'
import { ControlSidebar } from '../components/layouts/ControlSidebar'

export function LayoutCampamento() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ControlSidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-50">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
