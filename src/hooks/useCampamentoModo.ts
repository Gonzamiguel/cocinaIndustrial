import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export type CampamentoModo = 'comensales' | 'logistica'

const STORAGE_KEY = 'casposo.modoWorkspace'

export function modoFromPathname(pathname: string): CampamentoModo {
  if (pathname.startsWith('/campamento')) {
    return 'logistica'
  }
  return 'comensales'
}

export function homeForModo(modo: CampamentoModo): string {
  return modo === 'logistica' ? '/campamento/recepcion' : '/control'
}

function readStoredModo(pathname: string): CampamentoModo {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === 'logistica' || stored === 'comensales') return stored
  } catch {
    /* sessionStorage no disponible */
  }
  return modoFromPathname(pathname)
}

/** Modo de trabajo Casposo: comensales/alojamiento vs stock/pedidos (persistido en sesión). */
export function useCampamentoModo() {
  const location = useLocation()
  const navigate = useNavigate()
  const [modo, setModo] = useState<CampamentoModo>(() =>
    readStoredModo(location.pathname),
  )

  useEffect(() => {
    const fromPath = modoFromPathname(location.pathname)
    setModo(fromPath)
    try {
      sessionStorage.setItem(STORAGE_KEY, fromPath)
    } catch {
      /* ignore */
    }
  }, [location.pathname])

  const cambiarModo = useCallback(
    (next: CampamentoModo) => {
      setModo(next)
      try {
        sessionStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      navigate(homeForModo(next))
    },
    [navigate],
  )

  return { modo, cambiarModo }
}
