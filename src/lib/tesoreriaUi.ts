import type { User } from 'firebase/auth'
import { TesoreriaError } from './tesoreria'
import type { EstadoFacturaProveedor, EstadoOrdenPago, MetodoPago } from '../types/tesoreria'

const MONEY_PRECISION = 100

export function roundMoney(n: number): number {
  return Math.round(n * MONEY_PRECISION) / MONEY_PRECISION
}

export function formatMonedaArs(value: number, moneda: 'ARS' | 'USD' = 'ARS'): string {
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
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    const d = ts.toDate() as Date
    return d.toLocaleDateString('es-AR')
  }
  return '—'
}

export function nombreUsuarioFromAuth(user: User | null): string {
  if (!user) return 'Usuario'
  const display = user.displayName?.trim()
  if (display) return display
  const email = user.email?.trim()
  if (email) return email.split('@')[0] ?? email
  return 'Usuario'
}

export function estiloBadgeEstadoFactura(estado: EstadoFacturaProveedor): {
  backgroundColor: string
  color: string
} {
  switch (estado) {
    case 'PENDIENTE_PAGO':
      return { backgroundColor: '#FFF7ED', color: '#C2410C' }
    case 'PAGO_PARCIAL':
      return { backgroundColor: '#FEF3C7', color: '#B45309' }
    case 'PAGADA':
      return { backgroundColor: '#ECFDF5', color: '#047857' }
    case 'ANULADA':
      return { backgroundColor: '#F3F4F6', color: '#6B7280' }
    default:
      return { backgroundColor: '#F3F4F6', color: '#374151' }
  }
}

export function etiquetaEstadoFactura(estado: EstadoFacturaProveedor): string {
  switch (estado) {
    case 'PENDIENTE_PAGO':
      return 'Pendiente de pago'
    case 'PAGO_PARCIAL':
      return 'Pago parcial'
    case 'PAGADA':
      return 'Pagada'
    case 'ANULADA':
      return 'Anulada'
    default:
      return estado
  }
}

export function estiloBadgeEstadoOrdenPago(estado: EstadoOrdenPago): {
  backgroundColor: string
  color: string
} {
  switch (estado) {
    case 'EMITIDA':
      return { backgroundColor: '#ECFDF5', color: '#047857' }
    case 'ANULADA':
      return { backgroundColor: '#FEE2E2', color: '#B91C1C' }
    default:
      return { backgroundColor: '#F3F4F6', color: '#374151' }
  }
}

export function etiquetaEstadoOrdenPago(estado: EstadoOrdenPago): string {
  switch (estado) {
    case 'EMITIDA':
      return 'Emitida'
    case 'ANULADA':
      return 'Anulada'
    default:
      return estado
  }
}

export function etiquetaMetodoPago(metodo: MetodoPago): string {
  switch (metodo) {
    case 'TRANSFERENCIA':
      return 'Transferencia'
    case 'CHEQUE':
      return 'Cheque'
    case 'EFECTIVO':
      return 'Efectivo'
    default:
      return metodo
  }
}

export function mensajeErrorTesoreria(err: unknown): string {
  if (err instanceof TesoreriaError) return err.message
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

export function moneyIgual(a: number, b: number, tolerancia = 0.02): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerancia
}

export type UrgenciaVencimiento = 'VENCIDA' | 'PROXIMA' | 'OK'

function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function diffDiasYmd(desdeYmd: string, hastaYmd: string): number {
  const desde = parseYmdLocal(desdeYmd)
  const hasta = parseYmdLocal(hastaYmd)
  if (!desde || !hasta) return 0
  const ms = hasta.getTime() - desde.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** Clasifica urgencia de pago según fecha de vencimiento (YYYY-MM-DD). */
export function urgenciaVencimiento(
  fechaVencimiento: string,
  hoyYmd: string = hoyYmdLocal(),
): UrgenciaVencimiento {
  const diff = diffDiasYmd(hoyYmd, fechaVencimiento)
  if (diff < 0) return 'VENCIDA'
  if (diff <= 7) return 'PROXIMA'
  return 'OK'
}

export function estiloBadgeUrgenciaVencimiento(urgencia: UrgenciaVencimiento): {
  className: string
  label: string
} {
  switch (urgencia) {
    case 'VENCIDA':
      return {
        className: 'bg-red-100 text-red-800 ring-red-200',
        label: 'Vencida',
      }
    case 'PROXIMA':
      return {
        className: 'bg-amber-100 text-amber-900 ring-amber-200',
        label: 'Vence pronto',
      }
    default:
      return {
        className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        label: 'Al día',
      }
  }
}
