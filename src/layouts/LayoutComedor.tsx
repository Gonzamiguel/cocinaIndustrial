import { Outlet } from 'react-router-dom'

/** Layout quiosco: pantalla completa sin navegación lateral (rol `control_comedor`). */
export function LayoutComedor() {
  return (
    <div className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-neutral-50">
      <Outlet />
    </div>
  )
}
