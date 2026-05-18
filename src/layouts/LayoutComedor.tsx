import { Outlet } from 'react-router-dom'

/** Layout modo quiosco: pantalla completa, sin sidebar ni navegación lateral. */
export function LayoutComedor() {
  return (
    <div className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-neutral-50">
      <Outlet />
    </div>
  )
}
