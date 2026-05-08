import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '../components/admin/AdminSidebar'

export function LayoutAdmin() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-surface md:flex-row">
      <AdminSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
