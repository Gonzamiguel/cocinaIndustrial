import { ClipboardList, Database, PackageCheck } from 'lucide-react'
import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

type IconProps = SVGProps<SVGSVGElement>

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
    to: '/campamento/recepcion',
    label: 'Recepción de mercadería',
    Icon: PackageCheck,
  },
  {
    to: '/campamento/inventario',
    label: 'Inventario local / Kardex',
    Icon: Database,
  },
  {
    to: '/campamento/comandas',
    label: 'Comandas de consumo diario',
    Icon: ClipboardList,
  },
] as const

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
    isActive
      ? 'bg-[#CD1818]/10 text-[#CD1818] ring-1 ring-[#CD1818]/20'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#CD1818]'
  }`

export function CampamentoSidebar() {
  const { logout, ubicacionId } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="relative flex shrink-0 flex-col overflow-visible border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] md:w-60 md:border-b-0 md:border-r md:border-neutral-200 lg:w-64">
      <div className="border-b border-neutral-100 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
          Campamento / sub-depósito
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#CD1818]">
          Comedor industrial
        </p>
        {ubicacionId ? (
          <p className="mt-2 rounded-lg bg-[#CD1818]/8 px-2 py-1 text-xs font-medium text-[#171717]">
            Sucursal: {ubicacionId}
          </p>
        ) : null}
      </div>

      <nav
        className="flex min-h-0 flex-1 gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Campamento"
      >
        {navItems.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#CD1818]/12 text-[#CD1818]"
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
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
