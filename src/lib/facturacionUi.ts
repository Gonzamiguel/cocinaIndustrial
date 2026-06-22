import { FacturacionError } from './facturacion'
import type { EstadoLiquidacionContratista } from '../types/facturacion'

export function formatMonedaLiquidacion(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(monto)
}

export function formatFechaLiquidacion(ts: unknown): string {
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    return (ts.toDate() as Date).toLocaleDateString('es-AR')
  }
  return '—'
}

export function formatYmdLegible(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '—'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

export function mensajeErrorFacturacion(err: unknown): string {
  if (err instanceof FacturacionError) return err.message
  if (err instanceof Error) return err.message
  return 'Ocurrió un error inesperado.'
}

export function estiloBadgeEstadoLiquidacion(estado: EstadoLiquidacionContratista): {
  className: string
} {
  switch (estado) {
    case 'EMITIDA':
      return { className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
    case 'ANULADA':
      return { className: 'bg-neutral-100 text-neutral-600 ring-neutral-200' }
    case 'BORRADOR':
    default:
      return { className: 'bg-amber-50 text-amber-800 ring-amber-200' }
  }
}

export function parsePrecioInput(value: string): number {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}
