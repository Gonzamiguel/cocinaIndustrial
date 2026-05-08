import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PanelTopBarProps = {
  titulo: string
  mostrarMarca?: boolean
}

export function PanelTopBar({
  titulo,
  mostrarMarca = false,
}: PanelTopBarProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesión() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 flex w-full shrink-0 items-center justify-between gap-4 border-b border-neutral-200/90 bg-white px-5 py-3.5 shadow-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {mostrarMarca ? (
          <>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Panel corporativo
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-brand-accent sm:text-base">
              Comedor industrial
            </span>
            <span
              className="hidden h-5 w-px shrink-0 bg-neutral-200 sm:block"
              aria-hidden
            />
          </>
        ) : null}
        <p className="truncate whitespace-nowrap text-sm font-semibold tracking-tight text-neutral-900 sm:text-base">
          {titulo}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleCerrarSesión()}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-accent shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/25"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 opacity-90"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
            clipRule="evenodd"
          />
          <path
            fillRule="evenodd"
            d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114L8.704 10.75h9.546A.75.75 0 0 0 19 10Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Cerrar sesión</span>
      </button>
    </header>
  )
}
