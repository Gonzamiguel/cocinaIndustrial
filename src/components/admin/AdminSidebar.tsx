import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ConnectionStatus } from '../layout/ConnectionStatus'

type IconProps = SVGProps<SVGSVGElement>

function IconClipboard(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M9 4.75h6" />
      <path d="M9.75 3h4.5A2.25 2.25 0 0 1 16.5 5.25v.75h1.25A2.25 2.25 0 0 1 20 8.25v10.5A2.25 2.25 0 0 1 17.75 21H6.25A2.25 2.25 0 0 1 4 18.75V8.25A2.25 2.25 0 0 1 6.25 6H7.5v-.75A2.25 2.25 0 0 1 9.75 3Z" />
      <path d="M8.5 10.5h7" />
      <path d="M8.5 14h7" />
    </svg>
  )
}

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

function IconUtensils(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M6 3.75v7.5" />
      <path d="M9 3.75v7.5" />
      <path d="M6 7.5h3" />
      <path d="M7.5 11.25V20.25" />
      <path d="M16.5 3.75c1.8 0 3.25 1.58 3.25 3.52v3.48H16.5v9.5" />
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

function IconBox(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="m12 3.75 7 4.03v8.44l-7 4.03-7-4.03V7.78l7-4.03Z" />
      <path d="m5 8.25 7 4 7-4" />
      <path d="M12 12.25v8" />
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
    to: '/admin/pedidos',
    label: 'Pedidos del día',
    Icon: IconClipboard,
    accent: true,
  },
  {
    to: '/admin/dashboard',
    label: 'Dashboard',
    Icon: IconChart,
    accent: false,
  },
  {
    to: '/admin/menu',
    label: 'Gestión de menú',
    Icon: IconUtensils,
    accent: false,
  },
  {
    to: '/admin/recetario',
    label: 'Recetario',
    Icon: IconBook,
    accent: false,
  },
  {
    to: '/admin/mercaderia',
    label: 'Mercadería',
    Icon: IconBox,
    accent: true,
  },
] as const

export function AdminSidebar() {
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
          Panel corporativo
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-brand-accent">
          Comedor industrial
        </p>
        <ConnectionStatus />
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-row gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Administración"
      >
        {navItems.map(({ to, label, Icon, accent }) => (
          <NavLink
            key={to}
            to={to}
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
              <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
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
