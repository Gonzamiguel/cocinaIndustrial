import {
  BarChart3,
  BedDouble,
  Brush,
  Building2,
  FileSpreadsheet,
  Hotel,
  Settings,
  Users,
  Wallet,
  ClipboardList,
  Receipt,
} from 'lucide-react'
// import { ChefHat } from 'lucide-react'
import type { SVGProps } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { esRolFinanzasLectura, esRolPanelControl } from '../../lib/rbac'
import { ConnectionStatus } from '../layout/ConnectionStatus'

type IconProps = SVGProps<SVGSVGElement>

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
  `group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
    isActive
      ? 'bg-[#CD1818]/10 text-[#CD1818] ring-1 ring-[#CD1818]/20'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#CD1818]'
  }`

const navItemsOperativos = [
  { to: '/control', label: 'Dashboard Comensales', Icon: BarChart3, end: true },
  { to: '/control/hoteleria', label: 'Dashboard Hotelería', Icon: Hotel, end: false },
  { to: '/control/padron', label: 'Padrón de Personas', Icon: Users, end: false },
  { to: '/control/empresas', label: 'Padrón de Empresas', Icon: Building2, end: false },
  { to: '/control/alojamiento', label: 'Mapa de camas', Icon: BedDouble, end: false },
  { to: '/control/reporte-limpieza', label: 'Auditoría de limpieza', Icon: Brush, end: false },
  { to: '/control/facturacion', label: 'Facturación', Icon: FileSpreadsheet, end: false },
] as const

const navItemsFinanzas = [
  { to: '/control/compras', label: 'Compras (OC)', Icon: ClipboardList, end: false },
  { to: '/control/liquidaciones', label: 'Liquidaciones', Icon: Receipt, end: false },
  { to: '/control/tesoreria', label: 'Tesorería', Icon: Wallet, end: false },
] as const

const navItemsConfig = [
  { to: '/control/configuracion', label: 'Configuración', Icon: Settings, end: false },
] as const

function NavSection({
  title,
  items,
}: {
  title?: string
  items: readonly {
    to: string
    label: string
    Icon: typeof BarChart3
    end: boolean
  }[]
}) {
  return (
    <>
      {title ? (
        <p className="mb-1 mt-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 first:mt-0">
          {title}
        </p>
      ) : null}
      {items.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass}>
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#CD1818]/12 text-[#CD1818]"
              aria-hidden
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="truncate">{label}</span>
          </span>
        </NavLink>
      ))}
    </>
  )
}

export function ControlSidebar() {
  const { logout, ubicacionId, rol } = useAuth()
  const navigate = useNavigate()
  const muestraOperaciones = esRolPanelControl(rol)
  const muestraFinanzas = esRolFinanzasLectura(rol)

  async function handleCerrarSesion() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="relative flex shrink-0 flex-col overflow-visible border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] md:w-64 md:border-b-0 md:border-r lg:w-72">
      <div className="border-b border-neutral-100 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
          Control operativo
        </p>
        <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#CD1818]">
          Comensales y hotelería
        </p>
        {ubicacionId ? (
          <p className="mt-2 rounded-lg bg-[#CD1818]/8 px-2 py-1 text-xs font-medium text-[#171717]">
            Sucursal: {ubicacionId}
          </p>
        ) : null}
        <ConnectionStatus />
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 overflow-x-auto px-2 py-4 md:overflow-visible md:px-3"
        aria-label="Panel de control"
      >
        {muestraOperaciones ? (
          <NavSection title="Operaciones" items={navItemsOperativos} />
        ) : null}
        {muestraFinanzas ? (
          <NavSection title="Finanzas" items={navItemsFinanzas} />
        ) : null}
        {muestraOperaciones ? (
          <NavSection title="Administración" items={navItemsConfig} />
        ) : null}
      </nav>

      <div className="mt-auto border-t border-neutral-100 p-3">
        <button
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-[#CD1818] transition hover:bg-[#CD1818]/5"
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
