import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type PanelTopBarProps = {
  titulo: string
}

export function PanelTopBar({ titulo }: PanelTopBarProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleCerrarSesión() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 flex w-full shrink-0 items-center justify-between gap-4 border-b border-neutral-200/90 bg-white px-4 py-3 shadow-sm sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-neutral-900 sm:text-base">
          {titulo}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleCerrarSesión()}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-[#003366] shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/25"
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
