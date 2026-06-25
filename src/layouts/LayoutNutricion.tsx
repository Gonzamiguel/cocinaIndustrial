import { Outlet } from 'react-router-dom'
import { NutricionSidebar } from '../components/nutricion/NutricionSidebar'

export function LayoutNutricion() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-surface md:flex-row">
      <NutricionSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
