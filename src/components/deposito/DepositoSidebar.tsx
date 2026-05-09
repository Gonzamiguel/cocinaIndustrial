import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

type IconProps = SVGProps<SVGSVGElement>

function IconBox(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="m12 3.75 7 4.03v8.44l-7 4.03-7-4.03V7.78l7-4.03Z" />
      <path d="m5 8.25 7 4 7-4" />
      <path d="M12 12.25v8" />
    </svg>
  )
}

function IconMovimientos(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M9 12h11M9 8h11M9 16h7" />
      <path d="M5 6.5h3.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  )
}

function IconInventario(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M4 7.5h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11Z" />
      <path d="M8 7.5V5.25a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V7.5" />
      <path d="M8 12h8M8 15.5h5" />
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

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
    isActive
      ? 'bg-brand-accent/10 text-brand-accent ring-1 ring-brand-accent/20'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-brand-accent'
  }`

export function DepositoSidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="relative flex shrink-0 flex-col overflow-visible border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] md:w-60 md:border-b-0 md:border-r md:border-neutral-200 lg:w-64">
      <div className="border-b border-neutral-100 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-muted">
          Panel corporativo
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-brand-accent">
          Comedor industrial
        </p>
      </div>

      <nav
        className="flex min-h-0 flex-1 gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Depósito"
      >
        <NavLink to="/deposito/solicitudes" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent/12 text-brand-accent"
              aria-hidden
            >
              <IconBox className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
              Solicitudes de mercadería
            </span>
          </span>
        </NavLink>

        <NavLink to="/deposito/insumos" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent/12 text-brand-accent"
              aria-hidden
            >
              <IconBox className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
              Catálogo de insumos
            </span>
          </span>
        </NavLink>

        <NavLink to="/deposito/movimientos" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent/12 text-brand-accent"
              aria-hidden
            >
              <IconMovimientos className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
              Movimientos
            </span>
          </span>
        </NavLink>

        <NavLink to="/deposito/inventario" className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent/12 text-brand-accent"
              aria-hidden
            >
              <IconInventario className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden truncate">
              Inventario actual
            </span>
          </span>
        </NavLink>
      </nav>

      <div className="mt-auto border-t border-neutral-100 p-4">
        <button
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-brand-accent transition hover:bg-brand-accent/5"
        >
          <IconLogout className="h-5 w-5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
