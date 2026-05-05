import { NavLink } from 'react-router-dom'

const linkBase =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export function AdminSidebar() {
  return (
    <aside className="flex shrink-0 flex-col border-b border-brand-muted/20 bg-brand-surface shadow-[0_1px_0_rgba(129,129,129,0.12)] md:w-60 md:border-b-0 md:border-r md:border-brand-muted/20 lg:w-64">
      <div className="border-b border-brand-muted/15 px-4 py-5 md:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-muted">
          Panel corporativo
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-brand-accent">
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
                ? 'bg-brand-accent/8 text-brand-accent ring-1 ring-brand-accent/25'
                : 'text-brand-muted hover:bg-brand-muted/8 hover:text-brand-accent'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-brand-accent"
            aria-hidden
          />
          Pedidos del día
        </NavLink>
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-brand-accent/8 text-brand-accent ring-1 ring-brand-accent/25'
                : 'text-brand-muted hover:bg-brand-muted/8 hover:text-brand-accent'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-brand-muted/60"
            aria-hidden
          />
          Dashboard
        </NavLink>
        <NavLink
          to="/admin/menu"
          className={({ isActive }) =>
            `${linkBase} whitespace-nowrap md:whitespace-normal ${
              isActive
                ? 'bg-brand-accent/8 text-brand-accent ring-1 ring-brand-accent/25'
                : 'text-brand-muted hover:bg-brand-muted/8 hover:text-brand-accent'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-brand-muted/60"
            aria-hidden
          />
          Gestión de menú
        </NavLink>
      </nav>

      <div className="mt-auto hidden border-t border-brand-muted/15 p-4 md:block">
        <NavLink
          to="/"
          className="block rounded-xl border border-brand-muted/25 bg-brand-surface px-4 py-2.5 text-center text-xs font-medium text-brand-accent transition hover:bg-brand-muted/5"
        >
          Ver vista cliente
        </NavLink>
      </div>
    </aside>
  )
}
