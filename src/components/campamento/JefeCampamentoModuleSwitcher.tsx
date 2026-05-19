import { Building2, Tent } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { esJefeCampamento } from '../../lib/rbac'

const baseBtn =
  'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:flex-none sm:px-5'

export function JefeCampamentoModuleSwitcher() {
  const { rol } = useAuth()
  const location = useLocation()

  if (!esJefeCampamento(rol)) return null

  const enCampamento = location.pathname.startsWith('/campamento')
  const enHoteleria = location.pathname.startsWith('/hoteleria')

  return (
    <header className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-[#8997A6]">
          Módulo activo — podés cambiar entre operaciones de campamento y hotelería.
        </p>
        <div className="flex flex-wrap gap-2 rounded-xl bg-neutral-100 p-1">
          <NavLink
            to="/campamento/recepcion"
            className={`${baseBtn} ${
              enCampamento
                ? 'bg-white text-[#CD1818] shadow-sm ring-1 ring-neutral-200'
                : 'text-neutral-600 hover:bg-white/70 hover:text-[#171717]'
            }`}
          >
            <Tent className="h-4 w-4 shrink-0" aria-hidden />
            Campamento
          </NavLink>
          <NavLink
            to="/hoteleria/mapa"
            className={`${baseBtn} ${
              enHoteleria
                ? 'bg-white text-[#CD1818] shadow-sm ring-1 ring-neutral-200'
                : 'text-neutral-600 hover:bg-white/70 hover:text-[#171717]'
            }`}
          >
            <Building2 className="h-4 w-4 shrink-0" aria-hidden />
            Hotelería
          </NavLink>
        </div>
      </div>
    </header>
  )
}
