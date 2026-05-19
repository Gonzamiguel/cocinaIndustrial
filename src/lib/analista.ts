import {
  calcularStockPorInsumo,
  type MovimientoInventario,
} from './movimientosInventario'
import { formatLabelInsumo, type Insumo } from './insumos'

export type FilaMovimientoAnalista = {
  movimientoId: string
  fecha: Date | null
  tipo: MovimientoInventario['tipo']
  insumoId: string
  insumo: string
  rubro: string
  subrubro: string
  cantidad: number
  unidad: string
  destino: string
  costoUnitario: number
  subtotal: number
  chofer: string
  patente: string
  numeroDocumento: string
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function formatFechaAnalista(value: Date | null): string {
  if (!value) return '—'
  return value.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCantidadAnalista(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

export function formatMonedaAnalista(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fechaIsoLocal(date: Date | null): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function detalleMovimientoAnalista(movimiento: MovimientoInventario): string {
  if (movimiento.tipo === 'INGRESO') return movimiento.proveedor || '—'
  if (movimiento.tipo === 'EGRESO') return movimiento.destino || '—'
  return movimiento.motivo || '—'
}

/** Destino / receptor / comanda para trazabilidad logística en reportes. */
export function textoDestinoTrazabilidad(movimiento: MovimientoInventario): string {
  if (movimiento.tipo === 'INGRESO') {
    return movimiento.proveedor?.trim() || '—'
  }
  if (movimiento.tipo === 'EGRESO') {
    const partes: string[] = []
    const dest = movimiento.destino?.trim()
    if (dest) partes.push(dest)
    const ub = movimiento.ubicacionDestino?.trim()
    if (ub) partes.push(`Receptor: ${ub}`)
    const obs = movimiento.observacionesComanda?.trim()
    if (obs) partes.push(`Comanda/obs.: ${obs}`)
    return partes.length ? partes.join(' · ') : '—'
  }
  if (movimiento.tipo === 'DECOMISO' || movimiento.tipo === 'AJUSTE') {
    return movimiento.motivo?.trim() || '—'
  }
  return '—'
}

function costoUnitarioFila(
  movimiento: MovimientoInventario,
  insumo: Insumo | undefined,
  item: MovimientoInventario['items'][number],
): number {
  if (movimiento.tipo === 'INGRESO') {
    const precioIngreso =
      item.precioUnitarioFacturado ?? item.costoPorUnidadBaseSnapshot
    return clampNonNegative(precioIngreso ?? insumo?.costoPorUnidadBase ?? 0)
  }
  return clampNonNegative(
    item.costoPorUnidadBaseSnapshot ?? insumo?.costoPorUnidadBase ?? 0,
  )
}

export function buildFilasMovimientoAnalista(
  movimientos: MovimientoInventario[],
  insumos: Insumo[],
): FilaMovimientoAnalista[] {
  const insumosById = new Map(insumos.map((insumo) => [insumo.id, insumo]))

  return movimientos.flatMap((movimiento) =>
    movimiento.items.map((item) => {
      const insumo = insumosById.get(item.insumoId)
      const costoUnitario = costoUnitarioFila(movimiento, insumo, item)
      return {
        movimientoId: movimiento.id,
        fecha: movimiento.fecha,
        tipo: movimiento.tipo,
        insumoId: item.insumoId,
        insumo: insumo ? formatLabelInsumo(insumo) : item.nombreSnapshot,
        rubro: insumo?.rubro || '—',
        subrubro: insumo?.subrubro || '—',
        cantidad: Number(item.cantidad) || 0,
        unidad: insumo?.unidadBase || '—',
        destino: textoDestinoTrazabilidad(movimiento),
        costoUnitario,
        subtotal: (Number(item.cantidad) || 0) * costoUnitario,
        chofer: movimiento.transporte?.chofer || '—',
        patente: movimiento.transporte?.patente || '—',
        numeroDocumento:
          movimiento.tipo === 'INGRESO' || movimiento.tipo === 'EGRESO'
            ? movimiento.numeroDocumento || '—'
            : movimiento.id,
      }
    }),
  )
}

export function calcularCapitalInmovilizadoAnalista(
  movimientos: MovimientoInventario[],
  insumos: Insumo[],
): number {
  const stockPorInsumo = calcularStockPorInsumo(movimientos)
  return insumos.reduce((acc, insumo) => {
    const stock = Math.max(0, stockPorInsumo.get(insumo.id) ?? 0)
    return acc + stock * insumo.costoPorUnidadBase
  }, 0)
}

export function calcularGastoMensualPorDestino(
  filas: FilaMovimientoAnalista[],
  referencia = new Date(),
): Array<{ destino: string; total: number }> {
  const mes = referencia.getMonth()
  const anio = referencia.getFullYear()
  const acumulado = new Map<string, number>()

  for (const fila of filas) {
    if (fila.tipo !== 'EGRESO' || !fila.fecha) continue
    if (fila.fecha.getMonth() !== mes || fila.fecha.getFullYear() !== anio) continue
    acumulado.set(fila.destino, (acumulado.get(fila.destino) ?? 0) + fila.subtotal)
  }

  return [...acumulado.entries()]
    .map(([destino, total]) => ({ destino, total }))
    .sort((a, b) => b.total - a.total)
}

/** Filas cuyo `fecha` cae en el mes calendario indicado (0 = enero). */
export function filasMovimientoDelMes(
  filas: FilaMovimientoAnalista[],
  anio: number,
  mes: number,
): FilaMovimientoAnalista[] {
  return filas.filter(
    (fila) =>
      fila.fecha != null &&
      fila.fecha.getFullYear() === anio &&
      fila.fecha.getMonth() === mes,
  )
}

export type AgregadoRubroMensual = {
  rubro: string
  subrubro: string
  movimientosItems: number
  subtotal: number
}

export function agregarPorRubroSubrubro(
  filas: FilaMovimientoAnalista[],
): AgregadoRubroMensual[] {
  const map = new Map<string, AgregadoRubroMensual>()
  for (const fila of filas) {
    const key = `${fila.rubro}||${fila.subrubro}`
    const prev = map.get(key) ?? {
      rubro: fila.rubro,
      subrubro: fila.subrubro,
      movimientosItems: 0,
      subtotal: 0,
    }
    prev.movimientosItems += 1
    prev.subtotal += fila.subtotal
    map.set(key, prev)
  }
  return [...map.values()].sort((a, b) => b.subtotal - a.subtotal)
}

export type AgregadoDestinoMensual = {
  destino: string
  subtotal: number
  items: number
}

export function agregarGastoEgresoPorDestino(
  filas: FilaMovimientoAnalista[],
): AgregadoDestinoMensual[] {
  const map = new Map<string, { subtotal: number; items: number }>()
  for (const fila of filas) {
    if (fila.tipo !== 'EGRESO') continue
    const prev = map.get(fila.destino) ?? { subtotal: 0, items: 0 }
    prev.subtotal += fila.subtotal
    prev.items += 1
    map.set(fila.destino, prev)
  }
  return [...map.entries()]
    .map(([destino, v]) => ({ destino, subtotal: v.subtotal, items: v.items }))
    .sort((a, b) => b.subtotal - a.subtotal)
}

export type AgregadoTipoMensual = {
  tipo: MovimientoInventario['tipo']
  subtotal: number
  items: number
}

export function agregarPorTipoMovimiento(
  filas: FilaMovimientoAnalista[],
): AgregadoTipoMensual[] {
  const map = new Map<MovimientoInventario['tipo'], { subtotal: number; items: number }>()
  for (const fila of filas) {
    const prev = map.get(fila.tipo) ?? { subtotal: 0, items: 0 }
    prev.subtotal += fila.subtotal
    prev.items += 1
    map.set(fila.tipo, prev)
  }
  return [...map.entries()]
    .map(([tipo, v]) => ({ tipo, subtotal: v.subtotal, items: v.items }))
    .sort((a, b) => b.subtotal - a.subtotal)
}

export type FilaResumenLogistica = {
  key: string
  chofer: string
  patente: string
  viajes: number
  kilosTotales: number
  valorTotal: number
}

/** Agrupa egresos por patente + chofer (mismo criterio que la vista de logística). */
export function buildResumenLogisticaDesdeFilas(
  filas: FilaMovimientoAnalista[],
): FilaResumenLogistica[] {
  const acumulado = new Map<
    string,
    FilaResumenLogistica & { viajesIds: Set<string> }
  >()

  for (const fila of filas) {
    if (fila.tipo !== 'EGRESO') continue
    const chofer = fila.chofer || 'Sin chofer'
    const patente = fila.patente || 'Sin patente'
    const key = `${patente}__${chofer}`
    const actual = acumulado.get(key) ?? {
      key,
      chofer,
      patente,
      viajes: 0,
      kilosTotales: 0,
      valorTotal: 0,
      viajesIds: new Set<string>(),
    }
    actual.viajesIds.add(fila.movimientoId)
    if (fila.unidad === 'Kg') {
      actual.kilosTotales += Math.abs(fila.cantidad)
    }
    actual.valorTotal += fila.subtotal
    acumulado.set(key, actual)
  }

  return [...acumulado.values()]
    .map(({ viajesIds, ...item }) => ({
      ...item,
      viajes: viajesIds.size,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
}
