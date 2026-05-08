import { NavLink } from 'react-router-dom'

const linkBase =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#003366] focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export function DepositoSidebar() {
  return (
    <aside className="flex shrink-0 flex-col border-b border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] md:w-60 md:border-b-0 md:border-r md:border-neutral-200 lg:w-64">
      <div className="border-b border-neutral-100 px-4 py-5 md:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Depósito
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-[#003366]">
          Logística
        </p>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto px-2 py-3 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:gap-1 md:overflow-visible md:px-3 md:py-6 [&::-webkit-scrollbar]:hidden"
        aria-label="Depósito"
      >
        <NavLink
          to="/deposito/solicitudes"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-[#003366]/10 text-[#003366] ring-1 ring-[#003366]/20'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#003366]'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-[#F39200]"
            aria-hidden
          />
          Solicitudes de mercadería
        </NavLink>
      </nav>

      <div className="mt-auto border-t border-neutral-100 p-4">
        <NavLink
          to="/"
          className="block rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-center text-xs font-medium text-[#003366] transition hover:bg-neutral-50"
        >
          Ver vista cliente
        </NavLink>
      </div>
    </aside>
  )
}
