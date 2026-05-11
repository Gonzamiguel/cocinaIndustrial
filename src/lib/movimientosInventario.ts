import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
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

export interface DatosTransporteMovimiento {
  chofer: string
  patente: string
  precinto: string
}

export const DESTINOS_EGRESO = [
  'Cocina Central',
  'Campamento Casposo',
  'Eventos / Catering',
  'Donación',
  'Otro destino',
] as const
export type DestinoEgreso = (typeof DESTINOS_EGRESO)[number]

/** Stock y movimientos del depósito principal (multi-sucursal). */
export const UBICACION_DEPOSITO_CENTRAL = 'CENTRAL'

/** ID de sucursal / campamento (ej. Casposo). */
export const UBICACION_CAMPAMENTO_CASPOSO = 'CASPOSO'

export type EstadoTrasladoInventario = 'EN_TRANSITO' | 'RECIBIDO'

/** Ítem de movimiento (trazabilidad HACCP); permite congelar costo histórico por unidad base. */
export interface ItemMovimientoInventario {
  insumoId: string
  nombreSnapshot: string
  cantidad: number
  lote?: string
  fechaVencimiento?: string | null
  temperatura?: string
  controlCalidadOk: boolean
  precioUnitarioFacturado?: number
  costoPorUnidadBaseSnapshot?: number
}

/** @deprecated Usar ItemMovimientoInventario */
export type ItemMovimientoIngreso = ItemMovimientoInventario

interface MovimientoBase {
  id: string
  fecha: Date | null
  items: ItemMovimientoInventario[]
  transporte?: DatosTransporteMovimiento
  /** Sucursal donde impacta el stock; ausente en legado = depósito central. */
  ubicacionId?: string
}

export interface MovimientoIngreso extends MovimientoBase {
  tipo: 'INGRESO'
  proveedor: string
  tipoDocumento: TipoDocumentoRecepcion
  numeroDocumento: string
  /** Egreso de origen si este ingreso cierra un traslado interno. */
  egresoTrasladoOrigenId?: string
}

/** Egreso por consumo diario en campamento (comanda). */
export const MOTIVO_EGRESO_CONSUMO_DIARIO = 'CONSUMO_DIARIO' as const

/** Destino fijo para comandas: no dispara traslado ni datos de transporte. */
export const DESTINO_EGRESO_CONSUMO_DIARIO = 'Consumo operativo diario' as const

export interface MovimientoEgreso extends MovimientoBase {
  tipo: 'EGRESO'
  destino: string
  numeroDocumento: string
  /** Motivo operativo (ej. consumo diario en campamento). */
  motivo?: string
  /** Texto libre de la comanda (turno, evento, etc.). */
  observacionesComanda?: string
  estadoTraslado?: EstadoTrasladoInventario
  /** Sucursal que debe recibir la mercadería (traslado desde `ubicacionId`). */
  ubicacionDestino?: string
  /** Cuando el campamento confirma recepción del traslado. */
  recibidoEn?: Date | null
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

export function ubicacionEfectivaMovimiento(m: MovimientoInventario): string {
  const raw = m.ubicacionId?.trim()
  if (!raw) return UBICACION_DEPOSITO_CENTRAL
  return raw.toUpperCase()
}

export function movimientosEnUbicacion(
  movimientos: MovimientoInventario[],
  ubicacionId: string,
): MovimientoInventario[] {
  const target = ubicacionId.trim().toUpperCase()
  return movimientos.filter((m) => ubicacionEfectivaMovimiento(m) === target)
}

export type CrearMovimientoInput =
  | {
      tipo: 'INGRESO'
      fecha: Date
      proveedor: string
      tipoDocumento: TipoDocumentoRecepcion
      numeroDocumento: string
      items: ItemMovimientoInventario[]
      ubicacionId?: string
      egresoTrasladoOrigenId?: string
    }
  | {
      tipo: 'EGRESO'
      fecha: Date
      destino: string
      numeroDocumento: string
      transporte?: DatosTransporteMovimiento
      items: ItemMovimientoInventario[]
      ubicacionId?: string
      /** Traslado a otra sucursal (≠ `ubicacionId`); si se omite se infiere desde `destino` cuando aplica. */
      ubicacionDestino?: string
      motivo?: string
      observacionesComanda?: string
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

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** A partir del texto de destino de egreso, devuelve `ubicacionDestino` si aplica traslado. */
export function ubicacionDestinoDesdeDestinoEgreso(
  destinoLabel: string,
): string | undefined {
  const n = normalizarTexto(destinoLabel)
  if (n.includes('casposo')) return UBICACION_CAMPAMENTO_CASPOSO
  return undefined
}

export function requiereDatosTransporte(destino: string): boolean {
  const normalized = normalizarTexto(destino)
  return normalized.includes('casposo') || normalized.includes('campamento')
}

function normalizarTransporte(
  raw: DatosTransporteMovimiento | null | undefined,
): DatosTransporteMovimiento | undefined {
  if (!raw) return undefined

  const chofer = raw.chofer.trim()
  const patente = raw.patente.trim().toUpperCase()
  const precinto = raw.precinto.trim()
  if (!chofer && !patente && !precinto) return undefined

  return {
    chofer,
    patente,
    precinto,
  }
}

function mapTransporte(raw: unknown): DatosTransporteMovimiento | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  return normalizarTransporte({
    chofer: typeof data.chofer === 'string' ? data.chofer : '',
    patente: typeof data.patente === 'string' ? data.patente : '',
    precinto: typeof data.precinto === 'string' ? data.precinto : '',
  })
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

  let costoPorUnidadBaseSnapshot: number | undefined
  if (o.costoPorUnidadBaseSnapshot != null) {
    const costo = Number(o.costoPorUnidadBaseSnapshot)
    if (Number.isFinite(costo) && costo >= 0) {
      costoPorUnidadBaseSnapshot = clampNonNegative(costo)
    }
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
    ...(costoPorUnidadBaseSnapshot !== undefined
      ? { costoPorUnidadBaseSnapshot }
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

function mapUbicacionId(data: Record<string, unknown>): string | undefined {
  const v = data.ubicacionId
  if (typeof v !== 'string' || !v.trim()) return undefined
  return v.trim().toUpperCase()
}

function mapEstadoTraslado(
  data: Record<string, unknown>,
): EstadoTrasladoInventario | undefined {
  const v = data.estadoTraslado
  if (v === 'EN_TRANSITO' || v === 'RECIBIDO') return v
  return undefined
}

function mapUbicacionDestino(data: Record<string, unknown>): string | undefined {
  const v = data.ubicacionDestino
  if (typeof v !== 'string' || !v.trim()) return undefined
  return v.trim().toUpperCase()
}

function mapEgresoTrasladoOrigenId(
  data: Record<string, unknown>,
): string | undefined {
  const v = data.egresoTrasladoOrigenId
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
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

  const transporte = mapTransporte(data.transporte)
  const ubicacionId = mapUbicacionId(data)
  const extraUbicacion = ubicacionId ? { ubicacionId } : {}

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
    const egresoOrigen = mapEgresoTrasladoOrigenId(data)
    return {
      id,
      tipo: 'INGRESO',
      fecha,
      proveedor,
      tipoDocumento,
      numeroDocumento,
      items,
      ...extraUbicacion,
      ...(transporte ? { transporte } : {}),
      ...(egresoOrigen ? { egresoTrasladoOrigenId: egresoOrigen } : {}),
    }
  }

  if (tipo === 'EGRESO') {
    const destino =
      typeof data.destino === 'string' ? data.destino.trim() : ''
    const numeroDocumento =
      typeof data.numeroDocumento === 'string'
        ? data.numeroDocumento.trim()
        : ''
    const motivo =
      typeof data.motivo === 'string' && data.motivo.trim()
        ? data.motivo.trim()
        : undefined
    const observacionesComanda =
      typeof data.observacionesComanda === 'string' &&
      data.observacionesComanda.trim()
        ? data.observacionesComanda.trim()
        : undefined
    const estadoTraslado = mapEstadoTraslado(data)
    const ubicacionDestino = mapUbicacionDestino(data)
    const recibidoEnRaw = data.recibidoEn
    let recibidoEn: Date | null = null
    if (recibidoEnRaw instanceof Timestamp) recibidoEn = recibidoEnRaw.toDate()
    return {
      id,
      tipo: 'EGRESO',
      fecha,
      destino,
      numeroDocumento,
      items,
      ...extraUbicacion,
      ...(transporte ? { transporte } : {}),
      ...(motivo ? { motivo } : {}),
      ...(observacionesComanda ? { observacionesComanda } : {}),
      ...(estadoTraslado ? { estadoTraslado } : {}),
      ...(ubicacionDestino ? { ubicacionDestino } : {}),
      ...(recibidoEn ? { recibidoEn } : {}),
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
      ...extraUbicacion,
      ...(transporte ? { transporte } : {}),
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
    ...extraUbicacion,
    ...(transporte ? { transporte } : {}),
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
    ...(it.costoPorUnidadBaseSnapshot != null &&
    Number.isFinite(it.costoPorUnidadBaseSnapshot) &&
    it.costoPorUnidadBaseSnapshot >= 0
      ? {
          costoPorUnidadBaseSnapshot: clampNonNegative(
            it.costoPorUnidadBaseSnapshot,
          ),
        }
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

    const ubicacionId = (
      input.ubicacionId?.trim() || UBICACION_DEPOSITO_CENTRAL
    ).toUpperCase()
    const egresoOrigen = input.egresoTrasladoOrigenId?.trim()

    batch.set(movRef, {
      tipo: 'INGRESO' as const,
      fecha: fechaTs,
      proveedor,
      tipoDocumento: input.tipoDocumento,
      numeroDocumento,
      ubicacionId,
      items: items.map((it) => itemToFirestore(it, true)),
      creadoEn: serverTimestamp(),
      ...(egresoOrigen ? { egresoTrasladoOrigenId: egresoOrigen } : {}),
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

    const esConsumoDiarioCampamento =
      input.motivo?.trim() === MOTIVO_EGRESO_CONSUMO_DIARIO

    const transporte = normalizarTransporte(input.transporte)
    if (!esConsumoDiarioCampamento && requiereDatosTransporte(destino)) {
      if (!transporte?.chofer) throw new Error('Indicá el nombre del chofer.')
      if (!transporte.patente) throw new Error('Indicá la patente del vehículo.')
      if (!transporte.precinto) throw new Error('Indicá el número de precinto.')
    }

    const items = await congelarCostoPorUnidadBaseSiFalta(
      db,
      normalizarItems(input.items, 'EGRESO'),
    )
    if (items.length === 0) {
      throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
    }

    const ubicacionId = (
      input.ubicacionId?.trim() || UBICACION_DEPOSITO_CENTRAL
    ).toUpperCase()
    const explicito = input.ubicacionDestino?.trim()
    const inferidoDesdeDestino = ubicacionDestinoDesdeDestinoEgreso(destino)
    const ubicacionDestinoInferida = (explicito || inferidoDesdeDestino)
      ? (explicito || inferidoDesdeDestino)!.trim().toUpperCase()
      : undefined
    const esTraslado =
      !!ubicacionDestinoInferida && ubicacionDestinoInferida !== ubicacionId

    const motivoTrim = input.motivo?.trim()
    const obsComandaTrim = input.observacionesComanda?.trim()

    batch.set(movRef, {
      tipo: 'EGRESO' as const,
      fecha: fechaTs,
      destino,
      numeroDocumento,
      ubicacionId,
      ...(transporte ? { transporte } : {}),
      ...(motivoTrim ? { motivo: motivoTrim } : {}),
      ...(obsComandaTrim ? { observacionesComanda: obsComandaTrim } : {}),
      items: items.map((it) => itemToFirestore(it, false)),
      creadoEn: serverTimestamp(),
      ...(esTraslado && ubicacionDestinoInferida
        ? {
            ubicacionDestino: ubicacionDestinoInferida,
            estadoTraslado: 'EN_TRANSITO' as const,
          }
        : {}),
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
    ubicacionId: UBICACION_DEPOSITO_CENTRAL,
    items: items.map((it) => itemToFirestore(it, false)),
    creadoEn: serverTimestamp(),
  })
  await batch.commit()
  return movRef.id
}

/** Valorización de ítems según `costoPorUnidadBaseSnapshot` (ARS). */
export function costoTotalItemsMovimiento(
  items: ItemMovimientoInventario[],
): number {
  return items.reduce((acc, it) => {
    const c = Number(it.costoPorUnidadBaseSnapshot)
    const unit = Number.isFinite(c) && c >= 0 ? c : 0
    const qty = Math.abs(Number(it.cantidad))
    const q = Number.isFinite(qty) ? qty : 0
    return acc + q * unit
  }, 0)
}

/**
 * Registra una comanda de consumo diario: egreso en la sucursal del usuario.
 */
export async function guardarComandaConsumoDiario(input: {
  ubicacionId: string
  fecha?: Date
  items: ItemMovimientoInventario[]
  observacionesComanda?: string
}): Promise<string> {
  const fecha = input.fecha ?? new Date()
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase()
  const numeroDocumento = `CMD-${fecha.getTime()}-${rnd}`
  return crearMovimiento({
    tipo: 'EGRESO',
    fecha,
    destino: DESTINO_EGRESO_CONSUMO_DIARIO,
    numeroDocumento,
    items: input.items,
    ubicacionId: input.ubicacionId,
    motivo: MOTIVO_EGRESO_CONSUMO_DIARIO,
    observacionesComanda: input.observacionesComanda,
  })
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

    let costoPorUnidadBaseSnapshot: number | undefined
    if (it.costoPorUnidadBaseSnapshot != null) {
      const costo = Number(it.costoPorUnidadBaseSnapshot)
      if (Number.isFinite(costo) && costo >= 0) {
        costoPorUnidadBaseSnapshot = clampNonNegative(costo)
      }
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
    if (costoPorUnidadBaseSnapshot !== undefined) {
      row.costoPorUnidadBaseSnapshot = costoPorUnidadBaseSnapshot
    }
    out.push(row)
  }
  return out
}

async function congelarCostoPorUnidadBaseSiFalta(
  db: ReturnType<typeof getDb>,
  items: ItemMovimientoInventario[],
): Promise<ItemMovimientoInventario[]> {
  const faltantes = [...new Set(
    items
      .filter(
        (item) =>
          item.costoPorUnidadBaseSnapshot == null ||
          !Number.isFinite(item.costoPorUnidadBaseSnapshot),
      )
      .map((item) => item.insumoId),
  )]

  if (faltantes.length === 0) return items

  const snaps = await Promise.all(
    faltantes.map((id) => getDoc(doc(db, COLLECTION_INSUMOS, id))),
  )
  const costoPorInsumoId = new Map<string, number>()

  for (let i = 0; i < faltantes.length; i++) {
    const snap = snaps[i]
    if (!snap.exists()) continue
    const raw = snap.data() as Record<string, unknown>
    costoPorInsumoId.set(
      faltantes[i],
      clampNonNegative(Number(raw.costoPorUnidadBase)),
    )
  }

  return items.map((item) => {
    if (
      item.costoPorUnidadBaseSnapshot != null &&
      Number.isFinite(item.costoPorUnidadBaseSnapshot)
    ) {
      return item
    }
    const snapshot = costoPorInsumoId.get(item.insumoId)
    return snapshot != null
      ? { ...item, costoPorUnidadBaseSnapshot: snapshot }
      : item
  })
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

/**
 * Movimientos cuya `ubicacionId` coincide con la sucursal (Kardex local).
 * Requiere índice compuesto `ubicacionId` + `fecha` en Firestore.
 */
export function subscribeMovimientosInventarioPorUbicacion(
  ubicacionId: string,
  onChange: (rows: MovimientoInventario[]) => void,
): Unsubscribe {
  const db = getDb()
  const ub = ubicacionId.trim().toUpperCase()
  const q = query(
    collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO),
    where('ubicacionId', '==', ub),
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
      console.error('subscribeMovimientosInventarioPorUbicacion', err)
      onChange([])
    },
  )
}

export type MovimientoEgresoTraslado = MovimientoEgreso

/** Egresos en traslado hacia la sucursal indicada (pendientes de recepción en campamento). */
export function subscribeTrasladosPendientesRecepcion(
  ubicacionDestinoId: string,
  onChange: (rows: MovimientoEgresoTraslado[]) => void,
): Unsubscribe {
  const db = getDb()
  const dest = ubicacionDestinoId.trim().toUpperCase()
  const q = query(
    collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO),
    where('ubicacionDestino', '==', dest),
    where('estadoTraslado', '==', 'EN_TRANSITO'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: MovimientoEgresoTraslado[] = []
      snap.forEach((d) => {
        const m = mapMovimientoDoc(d.id, d.data() as Record<string, unknown>)
        if (m?.tipo === 'EGRESO') rows.push(m)
      })
      rows.sort((a, b) => {
        const ta = a.fecha?.getTime() ?? 0
        const tb = b.fecha?.getTime() ?? 0
        return tb - ta
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeTrasladosPendientesRecepcion', err)
      onChange([])
    },
  )
}

/**
 * Cierra un traslado: marca el egreso como recibido y genera el ingreso en la sucursal destino.
 */
export async function confirmarRecepcionTrasladoCampamento(input: {
  egresoId: string
  ubicacionRecepcionId: string
  /** Misma cantidad de ítems que el egreso; `cantidad` = unidades recibidas (≤ enviadas). */
  itemsRecibidos: ItemMovimientoInventario[]
}): Promise<void> {
  const { egresoId, ubicacionRecepcionId, itemsRecibidos } = input
  const db = getDb()
  const egresoRef = doc(db, COLLECTION_MOVIMIENTOS_INVENTARIO, egresoId)
  const snap = await getDoc(egresoRef)
  if (!snap.exists()) throw new Error('No se encontró el movimiento de egreso.')

  const mov = mapMovimientoDoc(egresoId, snap.data() as Record<string, unknown>)
  if (!mov || mov.tipo !== 'EGRESO') {
    throw new Error('El documento no es un egreso válido.')
  }
  if (mov.estadoTraslado !== 'EN_TRANSITO') {
    throw new Error('Este remito ya no está pendiente de recepción.')
  }
  if (mov.ubicacionDestino !== ubicacionRecepcionId.trim().toUpperCase()) {
    throw new Error('Este traslado no corresponde a tu sucursal.')
  }

  if (itemsRecibidos.length !== mov.items.length) {
    throw new Error('La cantidad de ítems no coincide con el remito.')
  }

  for (let i = 0; i < mov.items.length; i++) {
    const orig = mov.items[i]
    const rec = itemsRecibidos[i]
    if (rec.insumoId !== orig.insumoId) {
      throw new Error('Los ítems no coinciden con el remito.')
    }
    const q = Number(rec.cantidad)
    if (!Number.isFinite(q) || q < 0) {
      throw new Error('Cantidad recibida inválida.')
    }
    if (q > orig.cantidad + 1e-9) {
      throw new Error(
        `La cantidad recibida no puede superar la enviada (${orig.nombreSnapshot}).`,
      )
    }
  }

  const mergedParaIngreso = mov.items.map((orig, i) => {
    const rec = itemsRecibidos[i]
    const qty = Number(rec.cantidad) || 0
    return {
      ...orig,
      cantidad: qty,
      controlCalidadOk: true,
    }
  })

  const itemsIngreso = normalizarItems(mergedParaIngreso, 'INGRESO')
  if (itemsIngreso.length === 0) {
    throw new Error('Indicá al menos una cantidad recibida mayor a cero.')
  }

  const ingresoRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const fechaRecepcion = Timestamp.fromDate(new Date())
  const numeroRc = `RC-${mov.numeroDocumento}-${egresoId.slice(0, 8)}`
  const ubicacionIngreso = ubicacionRecepcionId.trim().toUpperCase()

  const batch = writeBatch(db)
  batch.update(egresoRef, {
    estadoTraslado: 'RECIBIDO',
    recibidoEn: serverTimestamp(),
  })
  batch.set(ingresoRef, {
    tipo: 'INGRESO' as const,
    fecha: fechaRecepcion,
    proveedor: 'Depósito central (traslado)',
    tipoDocumento: 'Remito' as const,
    numeroDocumento: numeroRc,
    ubicacionId: ubicacionIngreso,
    egresoTrasladoOrigenId: egresoId,
    items: itemsIngreso.map((it) => itemToFirestore(it, false)),
    creadoEn: serverTimestamp(),
  })
  await batch.commit()
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
  opts?: { ubicacionId?: string },
): Map<string, number> {
  const scoped =
    opts?.ubicacionId != null
      ? movimientosEnUbicacion(movimientos, opts.ubicacionId)
      : movimientos
  const stock = new Map<string, number>()
  for (const mov of scoped) {
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
 * Stock disponible por lote para egresos: suma INGRESOS y AJUSTES (cantidad con signo),
 * resta EGRESOS/DECOMISO del mismo `lote` (misma clave normalizada).
 * Orden FEFO: fecha de vencimiento ascendente, luego número de lote.
 */
export function lotesDisponiblesParaEgreso(
  movimientos: MovimientoInventario[],
  insumoId: string,
  ubicacionId: string = UBICACION_DEPOSITO_CENTRAL,
): LoteDisponibleEgreso[] {
  const scoped = movimientosEnUbicacion(movimientos, ubicacionId)
  const map = new Map<string, { stock: number; fechaMin: string | null }>()

  for (const mov of scoped) {
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
      } else if (mov.tipo === 'AJUSTE') {
        const q = Number(it.cantidad)
        if (Number.isFinite(q) && q !== 0) cur.stock += q
        if (typeof it.fechaVencimiento === 'string' && it.fechaVencimiento.trim()) {
          cur.fechaMin = minIsoFecha(cur.fechaMin, it.fechaVencimiento.trim())
        }
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
