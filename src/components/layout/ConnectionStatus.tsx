import { useEffect, useState } from 'react'
import { waitForPendingWrites } from 'firebase/firestore'
import { getDb } from '../../lib/firebase'

/**
 * Indicador de red del navegador y de escrituras pendientes de Firestore al volver la conexión.
 */
export function ConnectionStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )
  const [firebaseSyncing, setFirebaseSyncing] = useState(false)

  useEffect(() => {
    const db = getDb()

    const flushPending = () => {
      setFirebaseSyncing(true)
      void waitForPendingWrites(db).finally(() => {
        setFirebaseSyncing(false)
      })
    }

    const onOnline = () => {
      setBrowserOnline(true)
      flushPending()
    }
    const onOffline = () => {
      setBrowserOnline(false)
      setFirebaseSyncing(false)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!browserOnline) {
    return (
      <div
        className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs font-medium leading-snug text-amber-950"
        role="status"
      >
        Modo Offline (Los cambios se sincronizarán al volver el WiFi)
      </div>
    )
  }

  if (firebaseSyncing) {
    return (
      <div
        className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50 px-3 py-2 text-xs font-medium leading-snug text-sky-950"
        role="status"
      >
        Conectado · sincronizando cambios pendientes con Firebase…
      </div>
    )
  }

  return (
    <div
      className="mt-3 rounded-lg border border-emerald-200/90 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950"
      role="status"
    >
      Conectado
    </div>
  )
}
