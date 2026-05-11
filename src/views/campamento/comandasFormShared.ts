import {
  MOTIVO_EGRESO_CONSUMO_DIARIO,
  lotesDisponiblesParaEgreso,
  type MovimientoEgreso,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'

export const OPT_LOTE_PLACEHOLDER = '__pick__'
export const OPT_LOTE_SIN = '__sin_lote__'

export type FilaComanda = {
  key: string
  insumoId: string
  /** `null` = aún no eligió lote; `''` = sin lote en sistema; otro = clave de lote. */
  loteKey: string | null
  cantidad: string
}

export function nuevaFila(): FilaComanda {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: '',
    loteKey: null,
    cantidad: '',
  }
}

export function esComandaConsumoDiario(m: MovimientoInventario): m is MovimientoEgreso {
  return m.tipo === 'EGRESO' && m.motivo === MOTIVO_EGRESO_CONSUMO_DIARIO
}

export function stockDisponibleEnComanda(
  filas: FilaComanda[],
  rowIndex: number,
  insumoId: string,
  loteKey: string,
  movimientos: MovimientoInventario[],
  ubicacionId: string,
): number {
  const lotes = lotesDisponiblesParaEgreso(movimientos, insumoId, ubicacionId)
  const base = lotes.find((l) => l.loteKey === loteKey)?.stock ?? 0
  let usado = 0
  for (let i = 0; i < filas.length; i++) {
    if (i === rowIndex) continue
    const f = filas[i]
    if (f.insumoId !== insumoId || f.loteKey === null) continue
    if (f.loteKey !== loteKey) continue
    const q = Number(f.cantidad)
    if (Number.isFinite(q) && q > 0) usado += q
  }
  return Math.max(0, base - usado)
}

export const selectClassComanda =
  'mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

export const inputClassComanda =
  'mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'
