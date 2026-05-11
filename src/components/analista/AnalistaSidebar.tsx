import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

type IconProps = SVGProps<SVGSVGElement>

function IconDashboard(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M4.75 12.25h5.5v7h-5.5z" />
      <path d="M10.25 4.75h5.5v14.5h-5.5z" />
      <path d="M15.75 8.25h3.5v11h-3.5z" />
    </svg>
  )
}

function IconDataset(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M5 5.75h14v12.5a1.75 1.75 0 0 1-1.75 1.75H6.75A1.75 1.75 0 0 1 5 18.25V5.75Z" />
      <path d="M8 9.25h8M8 12.75h8M8 16.25h5" />
    </svg>
  )
}

function IconCostos(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M12 3.75v16.5" />
      <path d="M16.25 7.25c0-1.93-1.9-3.5-4.25-3.5S7.75 5.32 7.75 7.25 9.65 10.75 12 10.75s4.25 1.57 4.25 3.5-1.9 3.5-4.25 3.5-4.25-1.57-4.25-3.5" />
    </svg>
  )
}

function IconLogistica(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M2.75 6.75h11.5v8.5H2.75z" />
      <path d="M14.25 9.25h3.24l2.01 2.68v3.32h-5.25z" />
      <path d="M7 17.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z" />
      <path d="M16.5 17.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z" />
    </svg>
  )
}

function IconResumenMensual(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M7.25 4.75h9.5a1.75 1.75 0 0 1 1.75 1.75v12a1.75 1.75 0 0 1-1.75 1.75h-9.5A1.75 1.75 0 0 1 5.5 18.5v-12A1.75 1.75 0 0 1 7.25 4.75Z" />
      <path d="M8.5 9.25h7M8.5 12.25h7M8.5 15.25h4.5" />
    </svg>
  )
}

function IconLogout(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M10 4.75H7.25A2.25 2.25 0 0 0 5 7v10a2.25 2.25 0 0 0 2.25 2.25H10" />
      <path d="M14.5 8.75 19 12l-4.5 3.25" />
      <path d="M18.5 12H9.75" />
    </svg>
  )
}

const navItems = [
  { to: '/analista/dashboard', label: 'Dashboard', Icon: IconDashboard },
  {
    to: '/analista/movimientos',
    label: 'Reporte maestro',
    Icon: IconDataset,
  },
  { to: '/analista/costos', label: 'Auditoría de costos', Icon: IconCostos },
  { to: '/analista/logistica', label: 'Estadística logística', Icon: IconLogistica },
  {
    to: '/analista/resumen-mensual',
    label: 'Resumen mensual',
    Icon: IconResumenMensual,
  },
] as const

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
    isActive
      ? 'bg-[#CD1818]/10 text-[#CD1818] ring-1 ring-[#CD1818]/20'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#CD1818]'
  }`

export function AnalistaSidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="relative flex shrink-0 flex-col overflow-visible border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] md:w-64 md:border-b-0 md:border-r">
      <div className="border-b border-neutral-100 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8997A6]">
          Analista / Gerencia
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#CD1818]">
          Comedor industrial
        </p>
      </div>

      <nav
        className="flex min-h-0 flex-1 gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Analista"
      >
        {navItems.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#CD1818]/12 text-[#CD1818]"
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
                {label}
              </span>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-neutral-100 p-4">
        <button
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-[#CD1818] transition hover:bg-[#CD1818]/5"
        >
          <IconLogout className="h-5 w-5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
