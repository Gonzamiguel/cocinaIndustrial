import type { Insumo } from './insumos'
import { formatLabelInsumo } from './insumos'
import {
  UBICACION_CAMPAMENTO_CASPOSO,
  UBICACION_COCINA_CENTRAL,
  ubicacionEfectivaMovimiento,
  type ItemMovimientoInventario,
  type MovimientoInventario,
  type ProduccionCocinaRegistro,
  type SaldoLoteResumen,
} from './movimientosInventario'
import type { RegistroComedor } from '../types/comedor'

/** Costo por registro de comedor usado solo en BI (0 = sin valorización en datos). */
export const BI_COSTO_ESTIMADO_POR_REGISTRO_COMEDOR_ARS = 0

export type UbicacionFiltroBi = 'TODAS' | 'CENTRAL' | 'COCINA' | 'CASPOSO'

export const UBICACIONES_BI: UbicacionFiltroBi[] = [
  'TODAS',
  'CENTRAL',
  'COCINA',
  'CASPOSO',
]

export function etiquetaUbicacionBi(u: UbicacionFiltroBi): string {
  switch (u) {
    case 'TODAS':
      return 'Todas las ubicaciones'
    case 'CENTRAL':
      return 'CENTRAL (Depósito)'
    case 'COCINA':
      return 'COCINA'
    case 'CASPOSO':
      return 'CASPOSO'
    default:
      return u
  }
}

export function rangoMesActualYmd(): { desde: string; hasta: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const ultimo = new Date(y, now.getMonth() + 1, 0).getDate()
  return {
    desde: `${y}-${m}-01`,
    hasta: `${y}-${m}-${String(ultimo).padStart(2, '0')}`,
  }
}

export function parseYmdStartLocal(ymd: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0)
  return dt
}

export function parseYmdEndLocal(ymd: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(y, mo - 1, d, 23, 59, 59, 999)
}

export function fechaEnRangoInclusivo(
  fecha: Date | null,
  desde: Date,
  hasta: Date,
): boolean {
  if (!fecha) return false
  const t = fecha.getTime()
  return t >= desde.getTime() && t <= hasta.getTime()
}

export function pasaFiltroUbicacion(ubicacionId: string, filtro: UbicacionFiltroBi): boolean {
  if (filtro === 'TODAS') return true
  return ubicacionId.trim().toUpperCase() === filtro
}

export function filtrarMovimientosBi(
  movs: MovimientoInventario[],
  filtroUb: UbicacionFiltroBi,
  desde: Date,
  hasta: Date,
): MovimientoInventario[] {
  return movs.filter((m) => {
    if (!fechaEnRangoInclusivo(m.fecha, desde, hasta)) return false
    return pasaFiltroUbicacion(ubicacionEfectivaMovimiento(m), filtroUb)
  })
}

export function filtrarSaldosBi(
  saldos: SaldoLoteResumen[],
  filtroUb: UbicacionFiltroBi,
): SaldoLoteResumen[] {
  if (filtroUb === 'TODAS') return saldos
  return saldos.filter((s) => s.ubicacionId === filtroUb)
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function costoUnitItem(
  mov: MovimientoInventario,
  insumo: Insumo | undefined,
  item: ItemMovimientoInventario,
): number {
  if (mov.tipo === 'INGRESO') {
    const precioIngreso = item.precioUnitarioFacturado ?? item.costoPorUnidadBaseSnapshot
    return clampNonNegative(precioIngreso ?? insumo?.costoPorUnidadBase ?? 0)
  }
  return clampNonNegative(item.costoPorUnidadBaseSnapshot ?? insumo?.costoPorUnidadBase ?? 0)
}

export function valorizarInventarioPorSaldos(
  saldos: SaldoLoteResumen[],
  insumos: Insumo[],
): number {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  let total = 0
  for (const s of saldos) {
    const ins = byId.get(s.insumoId)
    const costo = ins?.costoPorUnidadBase ?? 0
    total += Math.max(0, s.cantidad) * costo
  }
  return total
}

export function costoEgresosValorizadoPorUbicacion(
  movs: MovimientoInventario[],
  insumos: Insumo[],
): { ubicacion: string; total: number }[] {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  const acum = new Map<string, number>()
  for (const mov of movs) {
    if (mov.tipo !== 'EGRESO') continue
    const ub = ubicacionEfectivaMovimiento(mov)
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitItem(mov, ins, it)
      const qty = Math.abs(Number(it.cantidad)) || 0
      acum.set(ub, (acum.get(ub) ?? 0) + qty * cu)
    }
  }
  return [...acum.entries()]
    .map(([ubicacion, total]) => ({ ubicacion, total }))
    .sort((a, b) => b.total - a.total)
}

export function totalIngresosValorizadoPeriodo(
  movs: MovimientoInventario[],
  insumos: Insumo[],
): number {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  let t = 0
  for (const mov of movs) {
    if (mov.tipo !== 'INGRESO') continue
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitItem(mov, ins, it)
      const qty = Math.abs(Number(it.cantidad)) || 0
      t += qty * cu
    }
  }
  return t
}

export function totalDecomisosValorizadoPeriodo(
  movs: MovimientoInventario[],
  insumos: Insumo[],
): number {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  let t = 0
  for (const mov of movs) {
    if (mov.tipo !== 'DECOMISO') continue
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitItem(mov, ins, it)
      const qty = Math.abs(Number(it.cantidad)) || 0
      t += qty * cu
    }
  }
  return t
}

/** Valorización de egresos (costo unitario snapshot × cantidad). */
export function totalEgresosValorizadoPeriodo(
  movs: MovimientoInventario[],
  insumos: Insumo[],
): number {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  let t = 0
  for (const mov of movs) {
    if (mov.tipo !== 'EGRESO') continue
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitItem(mov, ins, it)
      const qty = Math.abs(Number(it.cantidad)) || 0
      t += qty * cu
    }
  }
  return t
}

export function indiceDesperdicioSobreIngresos(
  totalIngresos: number,
  totalDecomisos: number,
): number {
  if (!Number.isFinite(totalIngresos) || totalIngresos <= 0) return 0
  return (totalDecomisos / totalIngresos) * 100
}

export function produccionCostoRealEnPeriodo(
  regs: ProduccionCocinaRegistro[],
  filtroUb: UbicacionFiltroBi,
  desde: Date,
  hasta: Date,
): number {
  let t = 0
  for (const r of regs) {
    if (!r.fecha || !fechaEnRangoInclusivo(r.fecha, desde, hasta)) continue
    if (!pasaFiltroUbicacion(r.ubicacionId, filtroUb)) continue
    t += clampNonNegative(r.costoReal)
  }
  return t
}

export function registrosComedorEnPeriodo(
  regs: RegistroComedor[],
  desdeYmd: string,
  hastaYmd: string,
): RegistroComedor[] {
  return regs.filter((r) => r.diaOperativo >= desdeYmd && r.diaOperativo <= hastaYmd)
}

export function costoOperativoAlimentacion(
  produccionCostoReal: number,
  registrosComedor: RegistroComedor[],
): { total: number; asistencias: number; detalleComedor: number } {
  const n = registrosComedor.length
  const detalle = n * BI_COSTO_ESTIMADO_POR_REGISTRO_COMEDOR_ARS
  return {
    total: produccionCostoReal + detalle,
    asistencias: n,
    detalleComedor: detalle,
  }
}

/** Mapa "UBIC|INSUMO|LOTE" → mejor fecha vencimiento ISO conocida (desde ingresos). */
export function mapaVencimientoPorLoteDesdeMovimientos(
  movs: MovimientoInventario[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const mov of movs) {
    if (mov.tipo !== 'INGRESO') continue
    const ub = ubicacionEfectivaMovimiento(mov)
    for (const it of mov.items) {
      const fv = it.fechaVencimiento?.trim()
      if (!fv || !/^\d{4}-\d{2}-\d{2}$/.test(fv)) continue
      const lk = (it.lote ?? '').trim()
      const key = `${ub}|${it.insumoId}|${lk}`
      const prev = map.get(key)
      if (!prev || fv < prev) map.set(key, fv)
    }
  }
  return map
}

export type AlertaVencimientoBi = {
  ubicacionId: string
  insumoId: string
  insumoLabel: string
  loteKey: string
  cantidad: number
  fechaVencimiento: string
  diasRestantes: number
}

export function alertasVencimientoLotes(
  saldos: SaldoLoteResumen[],
  insumos: Insumo[],
  vencPorLote: Map<string, string>,
  filtroUb: UbicacionFiltroBi,
  hoy: Date = new Date(),
  diasUmbral = 15,
): AlertaVencimientoBi[] {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
  const msDay = 86400000
  const out: AlertaVencimientoBi[] = []

  for (const s of filtrarSaldosBi(saldos, filtroUb)) {
    if (s.cantidad <= 0) continue
    const key = `${s.ubicacionId}|${s.insumoId}|${s.loteKey}`
    const fv = vencPorLote.get(key)
    if (!fv) continue
    const [y, m, d] = fv.split('-').map(Number)
    const vto = new Date(y, m - 1, d).getTime()
    const diasRestantes = Math.ceil((vto - hoy0) / msDay)
    if (diasRestantes < 0 || diasRestantes > diasUmbral) continue
    const ins = byId.get(s.insumoId)
    out.push({
      ubicacionId: s.ubicacionId,
      insumoId: s.insumoId,
      insumoLabel: ins ? formatLabelInsumo(ins) : s.insumoId,
      loteKey: s.loteKey || '—',
      cantidad: s.cantidad,
      fechaVencimiento: fv,
      diasRestantes,
    })
  }

  return out.sort((a, b) => a.diasRestantes - b.diasRestantes)
}

export function enumerarDiasYmd(desdeYmd: string, hastaYmd: string): string[] {
  if (!desdeYmd || !hastaYmd || desdeYmd > hastaYmd) return []
  const out: string[] = []
  const [y0, m0, d0] = desdeYmd.split('-').map(Number)
  const cur = new Date(y0, m0 - 1, d0)
  const end = parseYmdEndLocal(hastaYmd)
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export type PuntoSerieDiaBi = { dia: string; asistencias: number; egresosValorCasposoCocina: number }

export function serieAsistenciasVsEgresosCocinaCasposo(
  dias: string[],
  registros: RegistroComedor[],
  movs: MovimientoInventario[],
  insumos: Insumo[],
): PuntoSerieDiaBi[] {
  const byId = new Map(insumos.map((i) => [i.id, i]))
  const regPorDia = new Map<string, number>()
  for (const r of registros) {
    regPorDia.set(r.diaOperativo, (regPorDia.get(r.diaOperativo) ?? 0) + 1)
  }

  const egresoPorDia = new Map<string, number>()
  for (const mov of movs) {
    if (mov.tipo !== 'EGRESO' || !mov.fecha) continue
    const ub = ubicacionEfectivaMovimiento(mov)
    if (ub !== UBICACION_COCINA_CENTRAL && ub !== UBICACION_CAMPAMENTO_CASPOSO) continue
    const y = mov.fecha.getFullYear()
    const m = String(mov.fecha.getMonth() + 1).padStart(2, '0')
    const d = String(mov.fecha.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    let sub = 0
    for (const it of mov.items) {
      const ins = byId.get(it.insumoId)
      const cu = costoUnitItem(mov, ins, it)
      sub += Math.abs(Number(it.cantidad) || 0) * cu
    }
    egresoPorDia.set(key, (egresoPorDia.get(key) ?? 0) + sub)
  }

  return dias.map((dia) => ({
    dia,
    asistencias: regPorDia.get(dia) ?? 0,
    egresosValorCasposoCocina: egresoPorDia.get(dia) ?? 0,
  }))
}
