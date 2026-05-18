import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

type IconProps = SVGProps<SVGSVGElement>

function IconBed(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 12V19M4 12h16M4 12V8a2 2 0 012-2h2M20 12V8a2 2 0 00-2-2h-2" />
      <path d="M8 6h8v6H8zM2 17h20" />
    </svg>
  )
}

function IconUsers(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconChart(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 3v18h18" />
      <path d="M7 12h3v6H7zM12 8h3v10h-3zM17 14h3v4h-3z" />
    </svg>
  )
}

function IconSettings(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2.5M12 20.5V23M4.22 4.22l1.77 1.77M17.99 17.99l1.77 1.77M1 12h2.5M20.5 12H23M4.22 19.78l1.77-1.77M17.99 6.01l1.77-1.77" />
    </svg>
  )
}

function IconLogout(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M10 4.75H7.25A2.25 2.25 0 005 7v10a2.25 2.25 0 002.25 2.25H10" />
      <path d="M14.5 8.75 19 12l-4.5 3.25" />
      <path d="M18.5 12H9.75" />
    </svg>
  )
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
    isActive
      ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200'
      : 'text-neutral-700 hover:bg-neutral-50 hover:text-orange-800'
  }`

export function HoteleriaSidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-neutral-200 bg-white shadow-sm md:w-64 md:border-b-0 md:border-r md:border-neutral-200 lg:w-72">
      <div className="border-b border-neutral-100 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Hotelería y campamento
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-orange-700">
          Casposo
        </p>
      </div>
      <nav
        className="flex flex-1 gap-1 overflow-x-auto px-2 py-4 md:flex-col md:overflow-visible md:px-3"
        aria-label="Hotelería"
      >
        <NavLink to="/hoteleria/mapa" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700"
              aria-hidden
            >
              <IconBed className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">Mapa de camas</span>
          </span>
        </NavLink>
        <NavLink to="/hoteleria/padron" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700"
              aria-hidden
            >
              <IconUsers className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">Padrón de personas</span>
          </span>
        </NavLink>
        <NavLink to="/hoteleria/pernoctes" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700"
              aria-hidden
            >
              <IconChart className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">Reporte de pernoctes</span>
          </span>
        </NavLink>
        <NavLink to="/hoteleria/configuracion" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700"
              aria-hidden
            >
              <IconSettings className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate">Configuración</span>
          </span>
        </NavLink>
      </nav>
      <div className="border-t border-neutral-100 p-3">
        <button
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-orange-800"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
            <IconLogout className="h-[18px] w-[18px]" />
          </span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
