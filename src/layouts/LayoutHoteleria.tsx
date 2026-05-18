import { Outlet } from 'react-router-dom'
import { HoteleriaSidebar } from '../components/hoteleria/HoteleriaSidebar'

export function LayoutHoteleria() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-100 md:flex-row">
      <HoteleriaSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
