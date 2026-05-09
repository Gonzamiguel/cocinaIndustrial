import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { COLLECTION_INSUMOS, computeCostoPorUnidadBase } from './insumos'
import { getDb } from './firebase'

export const COLLECTION_MOVIMIENTOS_INVENTARIO = 'movimientos_inventario'

export type TipoMovimientoInventario =
  | 'INGRESO'
  | 'EGRESO'
  | 'AJUSTE'
  | 'DECOMISO'

export type TipoDocumentoRecepcion = 'Remito' | 'Factura'

export const DESTINOS_EGRESO = [
  'Cocina Central',
  'Campamento Casposo',
  'Eventos / Catering',
  'Donación',
  'Otro destino',
] as const
export type DestinoEgreso = (typeof DESTINOS_EGRESO)[number]

/** Ítem de movimiento (trazabilidad HACCP); precio solo aplica a ingresos con facturación. */
export interface ItemMovimientoInventario {
  insumoId: string
  nombreSnapshot: string
  cantidad: number
  lote?: string
  fechaVencimiento?: string | null
  temperatura?: string
  controlCalidadOk: boolean
  precioUnitarioFacturado?: number
}

/** @deprecated Usar ItemMovimientoInventario */
export type ItemMovimientoIngreso = ItemMovimientoInventario

interface MovimientoBase {
  id: string
  fecha: Date | null
  items: ItemMovimientoInventario[]
}

export interface MovimientoIngreso extends MovimientoBase {
  tipo: 'INGRESO'
  proveedor: string
  tipoDocumento: TipoDocumentoRecepcion
  numeroDocumento: string
}

export interface MovimientoEgreso extends MovimientoBase {
  tipo: 'EGRESO'
  destino: string
  numeroDocumento: string
}

export interface MovimientoAjuste extends MovimientoBase {
  tipo: 'AJUSTE'
  motivo: string
}

export interface MovimientoDecomiso extends MovimientoBase {
  tipo: 'DECOMISO'
  motivo: string
}

export type MovimientoInventario =
  | MovimientoIngreso
  | MovimientoEgreso
  | MovimientoAjuste
  | MovimientoDecomiso

export type CrearMovimientoInput =
  | {
      tipo: 'INGRESO'
      fecha: Date
      proveedor: string
      tipoDocumento: TipoDocumentoRecepcion
      numeroDocumento: string
      items: ItemMovimientoInventario[]
    }
  | {
      tipo: 'EGRESO'
      fecha: Date
      destino: string
      numeroDocumento: string
      items: ItemMovimientoInventario[]
    }
  | {
      tipo: 'AJUSTE'
      fecha: Date
      motivo: string
      items: ItemMovimientoInventario[]
    }
  | {
      tipo: 'DECOMISO'
      fecha: Date
      motivo: string
      items: ItemMovimientoInventario[]
    }

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function mapItem(
  raw: unknown,
  movTipo: TipoMovimientoInventario,
): ItemMovimientoInventario | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const insumoId = typeof o.insumoId === 'string' ? o.insumoId.trim() : ''
  const nombreSnapshot =
    typeof o.nombreSnapshot === 'string' ? o.nombreSnapshot.trim() : ''
  const cantidad = Number(o.cantidad)
  const controlCalidadOk = o.controlCalidadOk === true
  const lote = typeof o.lote === 'string' ? o.lote.trim() : undefined
  const temperatura =
    typeof o.temperatura === 'string' ? o.temperatura.trim() : undefined
  let fechaVencimiento: string | null | undefined
  if (o.fechaVencimiento === null) fechaVencimiento = null
  else if (typeof o.fechaVencimiento === 'string')
    fechaVencimiento = o.fechaVencimiento.trim() || undefined
  else if (o.fechaVencimiento instanceof Timestamp)
    fechaVencimiento = o.fechaVencimiento.toDate().toISOString().slice(0, 10)

  let precioUnitarioFacturado: number | undefined
  if (movTipo === 'INGRESO' && o.precioUnitarioFacturado != null) {
    const p = Number(o.precioUnitarioFacturado)
    if (Number.isFinite(p) && p > 0) precioUnitarioFacturado = p
  }

  if (!insumoId || !nombreSnapshot || !Number.isFinite(cantidad)) return null

  if (movTipo === 'AJUSTE') {
    if (cantidad === 0) return null
  } else if (cantidad <= 0) return null

  return {
    insumoId,
    nombreSnapshot,
    cantidad,
    ...(lote ? { lote } : {}),
    ...(fechaVencimiento !== undefined && fechaVencimiento !== ''
      ? { fechaVencimiento }
      : {}),
    ...(temperatura ? { temperatura } : {}),
    controlCalidadOk,
    ...(precioUnitarioFacturado !== undefined
      ? { precioUnitarioFacturado }
      : {}),
  }
}

function inferTipoLegacy(data: Record<string, unknown>): TipoMovimientoInventario {
  const t = data.tipo
  if (
    t === 'INGRESO' ||
    t === 'EGRESO' ||
    t === 'AJUSTE' ||
    t === 'DECOMISO'
  ) {
    return t
  }
  return 'INGRESO'
}

function mapMovimientoDoc(
  id: string,
  data: Record<string, unknown>,
): MovimientoInventario | null {
  const tipo = inferTipoLegacy(data)

  const fechaRaw = data.fecha
  let fecha: Date | null = null
  if (fechaRaw instanceof Timestamp) fecha = fechaRaw.toDate()

  const itemsRaw = data.items
  const items: ItemMovimientoInventario[] = []
  if (Array.isArray(itemsRaw)) {
    for (const it of itemsRaw) {
      const m = mapItem(it, tipo)
      if (m) items.push(m)
    }
  }

  if (tipo === 'INGRESO') {
    const proveedor =
      typeof data.proveedor === 'string' ? data.proveedor.trim() : ''
    const tipoDocumentoRaw = data.tipoDocumento
    const tipoDocumento: TipoDocumentoRecepcion =
      tipoDocumentoRaw === 'Factura' ? 'Factura' : 'Remito'
    const numeroDocumento =
      typeof data.numeroDocumento === 'string'
        ? data.numeroDocumento.trim()
        : ''
    return {
      id,
      tipo: 'INGRESO',
      fecha,
      proveedor,
      tipoDocumento,
      numeroDocumento,
      items,
    }
  }

  if (tipo === 'EGRESO') {
    const destino =
      typeof data.destino === 'string' ? data.destino.trim() : ''
    const numeroDocumento =
      typeof data.numeroDocumento === 'string'
        ? data.numeroDocumento.trim()
        : ''
    return {
      id,
      tipo: 'EGRESO',
      fecha,
      destino,
      numeroDocumento,
      items,
    }
  }

  if (tipo === 'AJUSTE') {
    const motivo = typeof data.motivo === 'string' ? data.motivo.trim() : ''
    return {
      id,
      tipo: 'AJUSTE',
      fecha,
      motivo,
      items,
    }
  }

  const motivo =
    typeof data.motivo === 'string' ? data.motivo.trim() : ''
  return {
    id,
    tipo: 'DECOMISO',
    fecha,
    motivo,
    items,
  }
}

function itemToFirestore(it: ItemMovimientoInventario, incluirPrecio: boolean) {
  return {
    insumoId: it.insumoId,
    nombreSnapshot: it.nombreSnapshot,
    cantidad: it.cantidad,
    ...(it.lote ? { lote: it.lote } : {}),
    ...(it.fechaVencimiento ? { fechaVencimiento: it.fechaVencimiento } : {}),
    ...(it.temperatura ? { temperatura: it.temperatura } : {}),
    controlCalidadOk: it.controlCalidadOk,
    ...(incluirPrecio &&
    it.precioUnitarioFacturado != null &&
    it.precioUnitarioFacturado > 0
      ? { precioUnitarioFacturado: it.precioUnitarioFacturado }
      : {}),
  }
}

/**
 * Registra cualquier tipo de movimiento.
 * INGRESO con precio unitario &gt; 0 actualiza costo de envase en el catálogo.
 */
export async function crearMovimiento(input: CrearMovimientoInput): Promise<string> {
  const fechaTs = Timestamp.fromDate(input.fecha)
  const db = getDb()
  const movRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const batch = writeBatch(db)

  if (input.tipo === 'INGRESO') {
    const proveedor = input.proveedor.trim()
    const numeroDocumento = input.numeroDocumento.trim()
    if (!proveedor) throw new Error('Indicá el proveedor.')
    if (!numeroDocumento) throw new Error('Indicá el número de documento.')
    if (input.tipoDocumento !== 'Remito' && input.tipoDocumento !== 'Factura') {
      throw new Error('Tipo de documento inválido.')
    }

    const items = normalizarItems(input.items, 'INGRESO')
    if (items.length === 0) {
      throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
    }

    const precioActualizaCatalogo = new Map<string, number>()
    for (const it of items) {
      const p = it.precioUnitarioFacturado
      if (p != null && Number.isFinite(p) && p > 0) {
        precioActualizaCatalogo.set(it.insumoId, clampNonNegative(p))
      }
    }

    batch.set(movRef, {
      tipo: 'INGRESO' as const,
      fecha: fechaTs,
      proveedor,
      tipoDocumento: input.tipoDocumento,
      numeroDocumento,
      items: items.map((it) => itemToFirestore(it, true)),
      creadoEn: serverTimestamp(),
    })

    await aplicarActualizacionCostos(batch, db, precioActualizaCatalogo)
    await batch.commit()
    return movRef.id
  }

  if (input.tipo === 'EGRESO') {
    const destino = input.destino.trim()
    const numeroDocumento = input.numeroDocumento.trim()
    if (!destino) throw new Error('Indicá el destino del egreso.')
    if (!numeroDocumento) throw new Error('Indicá el número de documento.')

    const items = normalizarItems(input.items, 'EGRESO')
    if (items.length === 0) {
      throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
    }

    batch.set(movRef, {
      tipo: 'EGRESO' as const,
      fecha: fechaTs,
      destino,
      numeroDocumento,
      items: items.map((it) => itemToFirestore(it, false)),
      creadoEn: serverTimestamp(),
    })
    await batch.commit()
    return movRef.id
  }

  const motivo = input.motivo.trim()
  if (!motivo) throw new Error('Indicá el motivo.')

  const items = normalizarItems(input.items, input.tipo)
  if (items.length === 0) {
    throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
  }

  batch.set(movRef, {
    tipo: input.tipo,
    fecha: fechaTs,
    motivo,
    items: items.map((it) => itemToFirestore(it, false)),
    creadoEn: serverTimestamp(),
  })
  await batch.commit()
  return movRef.id
}

function normalizarItems(
  rawItems: ItemMovimientoInventario[],
  movTipo: TipoMovimientoInventario,
): ItemMovimientoInventario[] {
  const out: ItemMovimientoInventario[] = []
  for (const it of rawItems) {
    const insumoId = it.insumoId?.trim() ?? ''
    const nombreSnapshot = it.nombreSnapshot?.trim() ?? ''
    const cantidad = Number(it.cantidad)
    if (!insumoId || !nombreSnapshot) continue

    if (movTipo === 'AJUSTE') {
      if (!Number.isFinite(cantidad) || cantidad === 0) continue
    } else if (!Number.isFinite(cantidad) || cantidad <= 0) {
      continue
    }

    const lote = it.lote?.trim()
    const temperatura = it.temperatura?.trim()
    const fv =
      typeof it.fechaVencimiento === 'string'
        ? it.fechaVencimiento.trim()
        : ''

    let precioUnitarioFacturado: number | undefined
    if (movTipo === 'INGRESO' && it.precioUnitarioFacturado != null) {
      const p = Number(it.precioUnitarioFacturado)
      if (Number.isFinite(p) && p > 0) precioUnitarioFacturado = p
    }

    const row: ItemMovimientoInventario = {
      insumoId,
      nombreSnapshot,
      cantidad,
      controlCalidadOk: it.controlCalidadOk === true,
    }
    if (lote) row.lote = lote
    if (fv) row.fechaVencimiento = fv
    if (temperatura) row.temperatura = temperatura
    if (precioUnitarioFacturado !== undefined) {
      row.precioUnitarioFacturado = precioUnitarioFacturado
    }
    out.push(row)
  }
  return out
}

async function aplicarActualizacionCostos(
  batch: ReturnType<typeof writeBatch>,
  db: ReturnType<typeof getDb>,
  precioActualizaCatalogo: Map<string, number>,
): Promise<void> {
  const idsActualizar = [...precioActualizaCatalogo.keys()]
  if (idsActualizar.length === 0) return

  const snaps = await Promise.all(
    idsActualizar.map((id) => getDoc(doc(db, COLLECTION_INSUMOS, id))),
  )
  for (let i = 0; i < idsActualizar.length; i++) {
    const insumoId = idsActualizar[i]
    const snap = snaps[i]
    if (!snap.exists()) continue
    const nuevoCostoEnvase = precioActualizaCatalogo.get(insumoId)!
    const raw = snap.data() as Record<string, unknown>
    const contenidoNeto = clampNonNegative(Number(raw.contenidoNeto))
    const costoPorUnidadBase = computeCostoPorUnidadBase(
      nuevoCostoEnvase,
      contenidoNeto,
    )
    batch.update(doc(db, COLLECTION_INSUMOS, insumoId), {
      costoEnvase: nuevoCostoEnvase,
      costoPorUnidadBase: clampNonNegative(costoPorUnidadBase),
      actualizadoEn: serverTimestamp(),
    })
  }
}

/** @deprecated Usar crearMovimiento */
export async function crearMovimientoIngreso(input: {
  fecha: Date
  proveedor: string
  tipoDocumento: TipoDocumentoRecepcion
  numeroDocumento: string
  items: ItemMovimientoInventario[]
}): Promise<string> {
  return crearMovimiento({
    tipo: 'INGRESO',
    fecha: input.fecha,
    proveedor: input.proveedor,
    tipoDocumento: input.tipoDocumento,
    numeroDocumento: input.numeroDocumento,
    items: input.items,
  })
}

export function subscribeMovimientosInventario(
  onChange: (rows: MovimientoInventario[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO),
    orderBy('fecha', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: MovimientoInventario[] = []
      snap.forEach((d) => {
        const m = mapMovimientoDoc(d.id, d.data() as Record<string, unknown>)
        if (m) rows.push(m)
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeMovimientosInventario', err)
      onChange([])
    },
  )
}

/** @deprecated Usar subscribeMovimientosInventario */
export function subscribeMovimientosIngreso(
  onChange: (rows: MovimientoInventario[]) => void,
): Unsubscribe {
  return subscribeMovimientosInventario(onChange)
}

/** Variación de stock por insumo aportada por un movimiento (para Kardex). */
export function deltaStockPorMovimiento(mov: MovimientoInventario): Map<string, number> {
  const delta = new Map<string, number>()
  for (const it of mov.items) {
    const id = it.insumoId
    const prev = delta.get(id) ?? 0
    if (mov.tipo === 'INGRESO') {
      delta.set(id, prev + Math.abs(it.cantidad))
    } else if (mov.tipo === 'EGRESO' || mov.tipo === 'DECOMISO') {
      delta.set(id, prev - Math.abs(it.cantidad))
    } else {
      delta.set(id, prev + it.cantidad)
    }
  }
  return delta
}

/** Stock por insumoId sumando todos los movimientos (orden no importa). */
export function calcularStockPorInsumo(
  movimientos: MovimientoInventario[],
): Map<string, number> {
  const stock = new Map<string, number>()
  for (const mov of movimientos) {
    const d = deltaStockPorMovimiento(mov)
    for (const [insumoId, v] of d) {
      stock.set(insumoId, (stock.get(insumoId) ?? 0) + v)
    }
  }
  return stock
}

/** Clave estable para agrupar ítems por lote (vacío = sin lote declarado). */
export function normalizarLoteKey(lote: string | undefined | null): string {
  return (typeof lote === 'string' ? lote.trim() : '') || ''
}

export type LoteDisponibleEgreso = {
  loteKey: string
  /** Valor a persistir en `item.lote` (coincide con la clave; vacío = sin lote). */
  lotePersistido: string
  fechaVencimiento: string | null
  stock: number
}

function minIsoFecha(a: string | null, b: string | null): string | null {
  const ta = parseFechaIsoMs(a)
  const tb = parseFechaIsoMs(b)
  if (ta === null) return b?.trim() ? b.trim() : null
  if (tb === null) return a!.trim()
  return ta <= tb ? a!.trim() : b!.trim()
}

function parseFechaIsoMs(s: string | null | undefined): number | null {
  if (!s?.trim()) return null
  const t = s.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [y, m, d] = t.split('-').map(Number)
  const ms = new Date(y, m - 1, d).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Stock disponible por lote para egresos: suma INGRESOS y resta EGRESOS/DECOMISO del mismo `lote`
 * (misma clave normalizada). Sin incluir AJUSTES (compatibilidad con Kardex global).
 * Orden FEFO: fecha de vencimiento ascendente, luego número de lote.
 */
export function lotesDisponiblesParaEgreso(
  movimientos: MovimientoInventario[],
  insumoId: string,
): LoteDisponibleEgreso[] {
  const map = new Map<string, { stock: number; fechaMin: string | null }>()

  for (const mov of movimientos) {
    for (const it of mov.items) {
      if (it.insumoId !== insumoId) continue
      const key = normalizarLoteKey(it.lote)
      const cur = map.get(key) ?? { stock: 0, fechaMin: null }

      if (mov.tipo === 'INGRESO') {
        const q = Math.abs(Number(it.cantidad))
        if (Number.isFinite(q)) cur.stock += q
        if (typeof it.fechaVencimiento === 'string' && it.fechaVencimiento.trim()) {
          cur.fechaMin = minIsoFecha(cur.fechaMin, it.fechaVencimiento.trim())
        }
      } else if (mov.tipo === 'EGRESO' || mov.tipo === 'DECOMISO') {
        const q = Math.abs(Number(it.cantidad))
        if (Number.isFinite(q)) cur.stock -= q
      }

      map.set(key, cur)
    }
  }

  const out: LoteDisponibleEgreso[] = []
  for (const [loteKey, v] of map) {
    if (v.stock <= 0) continue
    out.push({
      loteKey,
      lotePersistido: loteKey,
      fechaVencimiento: v.fechaMin,
      stock: v.stock,
    })
  }

  out.sort((a, b) => {
    const ta = parseFechaIsoMs(a.fechaVencimiento)
    const tb = parseFechaIsoMs(b.fechaVencimiento)
    if (ta === null && tb === null)
      return a.loteKey.localeCompare(b.loteKey, 'es')
    if (ta === null) return 1
    if (tb === null) return -1
    if (ta !== tb) return ta - tb
    return a.loteKey.localeCompare(b.loteKey, 'es')
  })

  return out
}
