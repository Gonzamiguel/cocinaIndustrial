import { NavLink } from 'react-router-dom'

/** Paleta corporativa panel cocina */
const NAV = {
  blue: '#003366',
  orange: '#F39200',
  muted: '#64748b',
} as const

const linkBase =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export function AdminSidebar() {
  return (
    <aside className="flex shrink-0 flex-col border-b border-[#003366]/15 bg-white shadow-[0_1px_0_rgba(0,51,102,0.08)] md:w-60 md:border-b-0 md:border-r md:border-[#003366]/12 lg:w-64">
      <div className="border-b border-[#003366]/10 px-4 py-5 md:px-5">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: NAV.muted }}
        >
          Panel corporativo
        </p>
        <p
          className="mt-1 text-lg font-semibold tracking-tight"
          style={{ color: NAV.blue }}
        >
          Comedor industrial
        </p>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:gap-1 md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Administración"
      >
        <NavLink
          to="/admin/pedidos"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-[#003366]/10 font-semibold text-[#003366] ring-1 ring-[#003366]/25'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#003366]'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: NAV.orange }}
            aria-hidden
          />
          Pedidos del día
        </NavLink>
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-[#003366]/10 font-semibold text-[#003366] ring-1 ring-[#003366]/25'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#003366]'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-neutral-300"
            aria-hidden
          />
          Dashboard
        </NavLink>
        <NavLink
          to="/admin/menu"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-[#003366]/10 font-semibold text-[#003366] ring-1 ring-[#003366]/25'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#003366]'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-neutral-300"
            aria-hidden
          />
          Gestión de menú
        </NavLink>
        <NavLink
          to="/admin/mercaderia"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-[#003366]/10 font-semibold text-[#003366] ring-1 ring-[#003366]/25'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#003366]'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: NAV.orange }}
            aria-hidden
          />
          Solicitar mercadería
        </NavLink>
      </nav>

      <div className="mt-auto border-t border-[#003366]/10 p-4">
        <NavLink
          to="/"
          className="block rounded-xl border border-[#003366]/20 bg-white px-4 py-2.5 text-center text-xs font-semibold text-[#003366] transition hover:bg-[#003366]/5"
        >
          Ver vista cliente
        </NavLink>
      </div>
    </aside>
  )
}
