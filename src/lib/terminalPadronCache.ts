import type { PadronPersona } from '../types/hoteleria'

const STORAGE_PADRON = 'terminal_padron_local_v1'
const STORAGE_SYNC = 'terminal_padron_ultima_sync_v1'

export function cargarPadronDesdeCache(): {
  padron: PadronPersona[]
  ultimaSincronizacion: string | null
} {
  if (typeof window === 'undefined') {
    return { padron: [], ultimaSincronizacion: null }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_PADRON)
    const ultimaSincronizacion = window.localStorage.getItem(STORAGE_SYNC)
    if (!raw) return { padron: [], ultimaSincronizacion }
    const parsed = JSON.parse(raw) as PadronPersona[]
    return {
      padron: Array.isArray(parsed) ? parsed : [],
      ultimaSincronizacion,
    }
  } catch {
    return { padron: [], ultimaSincronizacion: null }
  }
}

export function guardarPadronEnCache(
  padron: PadronPersona[],
  ultimaSincronizacion: string,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PADRON, JSON.stringify(padron))
    window.localStorage.setItem(STORAGE_SYNC, ultimaSincronizacion)
  } catch {
    /* quota / modo privado */
  }
}
