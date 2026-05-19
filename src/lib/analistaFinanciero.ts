import type { Insumo } from './insumos'
import type { RegistroComedor } from '../types/comedor'
import {
  filtrarMovimientosBi,
  totalDecomisosValorizadoPeriodo,
  totalEgresosValorizadoPeriodo,
  totalIngresosValorizadoPeriodo,
  type UbicacionFiltroBi,
} from './analistaBiDashboard'
import {
  MOTIVO_EGRESO_CONSUMO_DIARIO,
  UBICACION_CAMPAMENTO_CASPOSO,
  ubicacionEfectivaMovimiento,
  type MovimientoInventario,
} from './movimientosInventario'

export type PuntoSerieMacroBi = {
  dia: string
  egresosArs: number
  asistencias: number
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function costoUnitEgresoItem(
  ins: Insumo | undefined,
  item: MovimientoInventario['items'][number],
): number {
  return clampNonNegative(item.costoPorUnidadBaseSnapshot ?? ins?.costoPorUnidadBase ?? 0)
}

/** Egresos valorizados por día (todas las sedes) + asistencias comedor por día operativo. */
export function serieDiariaEgresosValorYAsistencias(
  dias: string[],
  registros: RegistroComedor[],
  movimientos: MovimientoInventario[],
  insumos: Insumo[],
): PuntoSerieMacroBi[] {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  const asistPorDia = new Map<string, number>()
  for (const r of registros) {
    asistPorDia.set(r.diaOperativo, (asistPorDia.get(r.diaOperativo) ?? 0) + 1)
  }

  const egresoPorDia = new Map<string, number>()
  for (const mov of movimientos) {
    if (mov.tipo !== 'EGRESO' || !mov.fecha) continue
    const y = mov.fecha.getFullYear()
    const m = String(mov.fecha.getMonth() + 1).padStart(2, '0')
    const d = String(mov.fecha.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    let sub = 0
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitEgresoItem(ins, it)
      sub += Math.abs(Number(it.cantidad) || 0) * cu
    }
    egresoPorDia.set(key, (egresoPorDia.get(key) ?? 0) + sub)
  }

  return dias.map((dia) => ({
    dia,
    egresosArs: egresoPorDia.get(dia) ?? 0,
    asistencias: asistPorDia.get(dia) ?? 0,
  }))
}

export function costoAlimentacionEgresosEnPeriodo(
  movs: MovimientoInventario[],
  insumos: Insumo[],
  filtroUb: UbicacionFiltroBi,
  desde: Date,
  hasta: Date,
): number {
  const rango = filtrarMovimientosBi(movs, filtroUb, desde, hasta)
  return totalEgresosValorizadoPeriodo(rango, insumos)
}

export function indicePerdidaDecomiso(
  movs: MovimientoInventario[],
  insumos: Insumo[],
  filtroUb: UbicacionFiltroBi,
  desde: Date,
  hasta: Date,
): { porcentaje: number; valorDecomisoArs: number; baseCirculacionArs: number } {
  const rango = filtrarMovimientosBi(movs, filtroUb, desde, hasta)
  const decom = totalDecomisosValorizadoPeriodo(rango, insumos)
  const ing = totalIngresosValorizadoPeriodo(rango, insumos)
  const egr = totalEgresosValorizadoPeriodo(rango, insumos)
  const base = ing + egr + decom
  const porcentaje = base > 0 ? (decom / base) * 100 : 0
  return { porcentaje, valorDecomisoArs: decom, baseCirculacionArs: base }
}

export type FilaAuditoriaCasposoDia = {
  fecha: string
  comandasStock: number
  asistencias: number
  desvioPct: number | null
}

/** Comandas de consumo diario en CASPOSO por día vs asistencias comedor. */
export function tablaAuditoriaCasposoPorDia(
  dias: string[],
  movimientos: MovimientoInventario[],
  registros: RegistroComedor[],
): FilaAuditoriaCasposoDia[] {
  const asistPorDia = new Map<string, number>()
  for (const r of registros) {
    asistPorDia.set(r.diaOperativo, (asistPorDia.get(r.diaOperativo) ?? 0) + 1)
  }

  const comandasPorDia = new Map<string, number>()
  for (const mov of movimientos) {
    if (mov.tipo !== 'EGRESO' || mov.motivo !== MOTIVO_EGRESO_CONSUMO_DIARIO) continue
    if (ubicacionEfectivaMovimiento(mov) !== UBICACION_CAMPAMENTO_CASPOSO) continue
    if (!mov.fecha) continue
    const y = mov.fecha.getFullYear()
    const m = String(mov.fecha.getMonth() + 1).padStart(2, '0')
    const d = String(mov.fecha.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    comandasPorDia.set(key, (comandasPorDia.get(key) ?? 0) + 1)
  }

  return dias.map((fecha) => {
    const comandasStock = comandasPorDia.get(fecha) ?? 0
    const asistencias = asistPorDia.get(fecha) ?? 0
    let desvioPct: number | null = null
    if (asistencias > 0) {
      desvioPct = ((comandasStock - asistencias) / asistencias) * 100
    } else if (comandasStock > 0) {
      desvioPct = 100
    }
    return { fecha, comandasStock, asistencias, desvioPct }
  })
}
