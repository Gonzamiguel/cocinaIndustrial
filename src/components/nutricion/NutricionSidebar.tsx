import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ConnectionStatus } from '../layout/ConnectionStatus'

type IconProps = SVGProps<SVGSVGElement>

function IconChart(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M4.75 19.25h14.5" />
      <path d="M7.5 16.5V10" />
      <path d="M12 16.5V6.75" />
      <path d="M16.5 16.5v-4.25" />
    </svg>
  )
}

function IconBook(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M6.75 4.75h9.5A2.75 2.75 0 0 1 19 7.5v11.75H9A2.25 2.25 0 0 0 6.75 21" />
      <path d="M6.75 4.75A2.75 2.75 0 0 0 4 7.5v10.75A2.75 2.75 0 0 0 6.75 21" />
      <path d="M8.75 8.5h6.5" />
      <path d="M8.75 12h6.5" />
    </svg>
  )
}

function IconTrending(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M4.75 19.25h14.5" />
      <path d="m7.5 14.25 3.25-3.25 2.5 2.5 5.75-5.75" />
      <path d="M16.5 7.75h3.25v3.25" />
    </svg>
  )
}

function IconList(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M8.5 6h11" />
      <path d="M8.5 12h11" />
      <path d="M8.5 18h11" />
      <path d="M4.75 6h.01" />
      <path d="M4.75 12h.01" />
      <path d="M4.75 18h.01" />
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
  {
    to: '/nutricion',
    label: 'Dashboard',
    Icon: IconChart,
    end: true,
    accent: true,
  },
  {
    to: '/nutricion/recetario',
    label: 'Recetario',
    Icon: IconBook,
    end: false,
    accent: false,
  },
  {
    to: '/nutricion/ingenieria-menu',
    label: 'Ingeniería de menú',
    Icon: IconTrending,
    end: false,
    accent: false,
  },
  {
    to: '/nutricion/planificacion',
    label: 'Planificación menú',
    Icon: IconList,
    end: false,
    accent: false,
  },
  {
    to: '/nutricion/produccion-real',
    label: 'Ficha vs cocina',
    Icon: IconTrending,
    end: false,
    accent: false,
  },
] as const

export function NutricionSidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="relative flex shrink-0 flex-col overflow-visible border-b border-brand-muted/15 bg-white shadow-[0_1px_0_rgba(129,129,129,0.08)] md:w-60 md:border-b-0 md:border-r md:border-brand-muted/12 lg:w-64">
      <div className="border-b border-brand-muted/10 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-muted">
          Área técnica
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-brand-accent">
          Nutrición
        </p>
        <ConnectionStatus />
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-row gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Nutrición"
      >
        {navItems.map(({ to, label, Icon, end, accent }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                isActive
                  ? 'bg-brand-accent/10 font-semibold text-brand-accent ring-1 ring-brand-accent/25'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-brand-accent'
              }`
            }
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  accent
                    ? 'bg-brand-accent/12 text-brand-accent'
                    : 'bg-neutral-100 text-neutral-500 group-hover:text-brand-accent'
                }`}
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap overflow-hidden">
                {label}
              </span>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-brand-muted/10 p-4">
        <button
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="flex w-full items-center gap-3 rounded-xl border border-brand-muted/20 bg-white px-4 py-2.5 text-left text-sm font-semibold text-brand-accent transition hover:bg-brand-accent/5"
        >
          <IconLogout className="h-5 w-5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
