import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '../components/admin/AdminSidebar'

export function LayoutAdmin() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-surface md:flex-row">
      <AdminSidebar />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
