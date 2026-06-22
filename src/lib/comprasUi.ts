import { OrdenCompraError } from './ordenesCompra'
import type { EstadoOrdenCompra } from '../types/compras'

export function formatMonedaCompra(value: number, moneda: 'ARS' | 'USD' = 'ARS'): string {
  const prefix = moneda === 'USD' ? 'USD ' : '$'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return value < 0 ? `-${prefix}${formatted}` : `${prefix}${formatted}`
}

export function formatYmdLegible(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

export function formatFechaTimestamp(ts: unknown): string {
  if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
    return ts.toLocaleDateString('es-AR')
  }
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    return (ts.toDate() as Date).toLocaleDateString('es-AR')
  }
  return '—'
}

export function estiloBadgeEstadoOc(estado: EstadoOrdenCompra): {
  backgroundColor: string
  color: string
} {
  switch (estado) {
    case 'BORRADOR':
      return { backgroundColor: '#F3F4F6', color: '#4B5563' }
    case 'PENDIENTE_APROBACION':
      return { backgroundColor: '#FFF7ED', color: '#C2410C' }
    case 'APROBADA':
      return { backgroundColor: '#EFF6FF', color: '#1D4ED8' }
    case 'RECIBIDA_PARCIAL':
      return { backgroundColor: '#FEF3C7', color: '#B45309' }
    case 'COMPLETADA':
      return { backgroundColor: '#ECFDF5', color: '#047857' }
    case 'CANCELADA':
      return { backgroundColor: '#FEE2E2', color: '#B91C1C' }
    default:
      return { backgroundColor: '#F3F4F6', color: '#374151' }
  }
}

export function etiquetaEstadoOc(estado: EstadoOrdenCompra): string {
  switch (estado) {
    case 'BORRADOR':
      return 'Borrador'
    case 'PENDIENTE_APROBACION':
      return 'Pendiente aprobación'
    case 'APROBADA':
      return 'Aprobada'
    case 'RECIBIDA_PARCIAL':
      return 'Recibida parcial'
    case 'COMPLETADA':
      return 'Completada'
    case 'CANCELADA':
      return 'Cancelada'
    default:
      return estado
  }
}

export function mensajeErrorCompras(err: unknown): string {
  if (err instanceof OrdenCompraError) return err.message
  if (err instanceof Error) return err.message
  return 'Ocurrió un error inesperado.'
}

export function hoyYmdLocal(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseNumeroInput(raw: string): number {
  const n = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
