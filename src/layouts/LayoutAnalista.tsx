import { Outlet } from 'react-router-dom'
import { AnalistaSidebar } from '../components/analista/AnalistaSidebar'

export function LayoutAnalista() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 md:flex-row">
      <AnalistaSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
