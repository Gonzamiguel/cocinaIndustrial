import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type QueryConstraint,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { COLLECTION_INSUMOS, computeCostoPorUnidadBase } from './insumos'
import { getDb } from './firebase'

export const COLLECTION_MOVIMIENTOS_INVENTARIO = 'movimientos_inventario'

/** Saldos por (ubicación, insumo, lote) para validación atómica en egresos. */
export const COLLECTION_SALDO_LOTES = 'saldo_lotes'

/** Ventana por defecto al suscribirse al historial (costo Firestore). */
export const DEFAULT_MOVIMIENTOS_RECENT_DAYS = 30

/** Límite por defecto de documentos por consulta en tiempo real. */
export const DEFAULT_MOVIMIENTOS_LIMIT = 100

/**
 * Firestore limita `limit()` a 10000 en consultas estructuradas.
 * @see https://firebase.google.com/docs/firestore/quotas
 */
export const FIRESTORE_QUERY_LIMIT_MAX = 10000

export type OpcionesSuscripcionMovimientos = {
  /** Máximo de documentos devueltos tras filtros de fecha. Por defecto {@link DEFAULT_MOVIMIENTOS_LIMIT}. */
  limite?: number
  /**
   * Inicio del rango (inclusive, inicio del día local).
   * - `undefined` (omitido): últimos {@link DEFAULT_MOVIMIENTOS_RECENT_DAYS} días.
   * - `null`: sin límite inferior (solo `orderBy` + `limite`; mayor costo).
   */
  fechaDesde?: Date | null
  /** Fin del rango (inclusive, fin del día local). */
  fechaHasta?: Date | null
}

/** Sin fecha desde: los N movimientos más recientes (tope Firestore: {@link FIRESTORE_QUERY_LIMIT_MAX}). */
export function opcionesHistorialAmplio(
  limite = FIRESTORE_QUERY_LIMIT_MAX,
): OpcionesSuscripcionMovimientos {
  return {
    fechaDesde: null,
    limite: Math.min(limite, FIRESTORE_QUERY_LIMIT_MAX),
  }
}

function normalizarLimiteConsulta(limite: number): number {
  const n = Number.isFinite(limite) ? Math.floor(limite) : DEFAULT_MOVIMIENTOS_LIMIT
  return Math.min(Math.max(1, n), FIRESTORE_QUERY_LIMIT_MAX)
}

function construirQueryMovimientosTodos(
  db: ReturnType<typeof getDb>,
  opciones: OpcionesSuscripcionMovimientos,
) {
  const limite = normalizarLimiteConsulta(
    opciones.limite ?? DEFAULT_MOVIMIENTOS_LIMIT,
  )
  const fechaDesde =
    opciones.fechaDesde === undefined
      ? startOfDayLocal(
          new Date(
            Date.now() - DEFAULT_MOVIMIENTOS_RECENT_DAYS * 24 * 60 * 60 * 1000,
          ),
        )
      : opciones.fechaDesde

  const parts: QueryConstraint[] = []

  if (fechaDesde != null) {
    parts.push(where('fecha', '>=', Timestamp.fromDate(fechaDesde)))
  }
  if (opciones.fechaHasta != null) {
    parts.push(
      where(
        'fecha',
        '<=',
        Timestamp.fromDate(endOfDayLocal(opciones.fechaHasta)),
      ),
    )
  }

  parts.push(orderBy('fecha', 'desc'))
  parts.push(limit(limite))

  return query(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO), ...parts)
}

function construirQueryMovimientosUbicacion(
  db: ReturnType<typeof getDb>,
  ubicacionId: string,
  opciones: OpcionesSuscripcionMovimientos,
) {
  const ub = ubicacionId.trim().toUpperCase()
  const limite = normalizarLimiteConsulta(
    opciones.limite ?? DEFAULT_MOVIMIENTOS_LIMIT,
  )
  const fechaDesde =
    opciones.fechaDesde === undefined
      ? startOfDayLocal(
          new Date(
            Date.now() - DEFAULT_MOVIMIENTOS_RECENT_DAYS * 24 * 60 * 60 * 1000,
          ),
        )
      : opciones.fechaDesde

  const parts: QueryConstraint[] = [where('ubicacionId', '==', ub)]

  if (fechaDesde != null) {
    parts.push(where('fecha', '>=', Timestamp.fromDate(fechaDesde)))
  }
  if (opciones.fechaHasta != null) {
    parts.push(
      where(
        'fecha',
        '<=',
        Timestamp.fromDate(endOfDayLocal(opciones.fechaHasta)),
      ),
    )
  }

  parts.push(orderBy('fecha', 'desc'))
  parts.push(limit(limite))

  return query(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO), ...parts)
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** Id estable para `saldo_lotes` (evita caracteres problemáticos en paths). */
export function saldoLoteDocumentId(
  ubicacionId: string,
  insumoId: string,
  loteKey: string,
): string {
  const u = ubicacionId.trim().toUpperCase()
  const id = insumoId.trim()
  const lk = typeof loteKey === 'string' ? loteKey.trim() : ''
  const raw = `${u}|${id}|${lk}`
  const b64 = btoa(unescape(encodeURIComponent(raw)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function refSaldoLote(
  db: ReturnType<typeof getDb>,
  ubicacionId: string,
  insumoId: string,
  loteKey: string,
) {
  return doc(
    db,
    COLLECTION_SALDO_LOTES,
    saldoLoteDocumentId(ubicacionId, insumoId, loteKey),
  )
}

type AgregadoSaldoEgreso = {
  ref: ReturnType<typeof doc>
  cantidad: number
  nombreSnapshot: string
  loteLabel: string
  insumoId: string
  loteKey: string
}

function agregarItemsEgresoPorSaldo(
  db: ReturnType<typeof getDb>,
  ubicacionId: string,
  items: ItemMovimientoInventario[],
): Map<string, AgregadoSaldoEgreso> {
  const map = new Map<string, AgregadoSaldoEgreso>()
  const ub = ubicacionId.trim().toUpperCase()
  for (const it of items) {
    const lk = normalizarLoteKey(it.lote)
    const id = saldoLoteDocumentId(ub, it.insumoId, lk)
    const cant = Math.abs(Number(it.cantidad))
    if (!Number.isFinite(cant) || cant <= 0) continue
    const prev = map.get(id)
    if (prev) {
      prev.cantidad += cant
    } else {
      map.set(id, {
        ref: refSaldoLote(db, ub, it.insumoId, lk),
        cantidad: cant,
        nombreSnapshot: it.nombreSnapshot,
        loteLabel: lk || '(sin lote)',
        insumoId: it.insumoId,
        loteKey: lk,
      })
    }
  }
  return map
}

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

/** Stock local de cocina central (traslados desde depósito y producción). */
export const UBICACION_COCINA_CENTRAL = 'COCINA'

/** Auditoría de corridas de producción (costo teórico vs declarado). */
export const COLLECTION_PRODUCCION_COCINA = 'produccion_cocina'

/** Egreso interno: insumos consumidos al elaborar platos (sin remito de transporte). */
export const MOTIVO_EGRESO_PRODUCCION_COCINA = 'PRODUCCION_COCINA' as const

export const DESTINO_EGRESO_PRODUCCION_COCINA =
  'Producción interna (consumo de insumos)' as const

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
  if (n.includes('cocina central')) return UBICACION_COCINA_CENTRAL
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

async function congelarCostoPorUnidadBaseEnTransaccion(
  transaction: Transaction,
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
    faltantes.map((id) => transaction.get(doc(db, COLLECTION_INSUMOS, id))),
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

function agregarNetDeltaAjustePorSaldo(
  db: ReturnType<typeof getDb>,
  items: ItemMovimientoInventario[],
): Map<
  string,
  {
    ref: ReturnType<typeof doc>
    netDelta: number
    nombreSnapshot: string
    loteLabel: string
    insumoId: string
    loteKey: string
  }
> {
  const map = new Map<
    string,
    {
      ref: ReturnType<typeof doc>
      netDelta: number
      nombreSnapshot: string
      loteLabel: string
      insumoId: string
      loteKey: string
    }
  >()
  const ub = UBICACION_DEPOSITO_CENTRAL
  for (const it of items) {
    const lk = normalizarLoteKey(it.lote)
    const id = saldoLoteDocumentId(ub, it.insumoId, lk)
    const delta = Number(it.cantidad)
    if (!Number.isFinite(delta) || delta === 0) continue
    const prev = map.get(id)
    if (prev) {
      prev.netDelta += delta
    } else {
      map.set(id, {
        ref: refSaldoLote(db, ub, it.insumoId, lk),
        netDelta: delta,
        nombreSnapshot: it.nombreSnapshot,
        loteLabel: lk || '(sin lote)',
        insumoId: it.insumoId,
        loteKey: lk,
      })
    }
  }
  return map
}

/**
 * Registra cualquier tipo de movimiento.
 * INGRESO con precio unitario &gt; 0 actualiza costo de envase en el catálogo.
 * EGRESO / DECOMISO validan y actualizan `saldo_lotes` en una transacción.
 */
export async function crearMovimiento(input: CrearMovimientoInput): Promise<string> {
  const fechaTs = Timestamp.fromDate(input.fecha)
  const db = getDb()
  const movRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))

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

    const idsCatalogo = [...precioActualizaCatalogo.keys()]

    await runTransaction(db, async (t) => {
      const insumoSnaps = await Promise.all(
        idsCatalogo.map((id) => t.get(doc(db, COLLECTION_INSUMOS, id))),
      )

      t.set(movRef, {
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

      for (const it of items) {
        const lk = normalizarLoteKey(it.lote)
        const qty = Math.abs(Number(it.cantidad))
        if (!Number.isFinite(qty) || qty <= 0) continue
        const sref = refSaldoLote(db, ubicacionId, it.insumoId, lk)
        t.set(
          sref,
          {
            ubicacionId,
            insumoId: it.insumoId,
            loteKey: lk,
            cantidad: increment(qty),
            actualizadoEn: serverTimestamp(),
          },
          { merge: true },
        )
      }

      for (let i = 0; i < idsCatalogo.length; i++) {
        const insumoId = idsCatalogo[i]
        const snap = insumoSnaps[i]
        if (!snap.exists()) continue
        const nuevoCostoEnvase = precioActualizaCatalogo.get(insumoId)!
        const raw = snap.data() as Record<string, unknown>
        const contenidoNeto = clampNonNegative(Number(raw.contenidoNeto))
        const costoPorUnidadBase = computeCostoPorUnidadBase(
          nuevoCostoEnvase,
          contenidoNeto,
        )
        t.update(doc(db, COLLECTION_INSUMOS, insumoId), {
          costoEnvase: nuevoCostoEnvase,
          costoPorUnidadBase: clampNonNegative(costoPorUnidadBase),
          actualizadoEn: serverTimestamp(),
        })
      }
    })
    return movRef.id
  }

  if (input.tipo === 'EGRESO') {
    const destino = input.destino.trim()
    const numeroDocumento = input.numeroDocumento.trim()
    if (!destino) throw new Error('Indicá el destino del egreso.')
    if (!numeroDocumento) throw new Error('Indicá el número de documento.')

    const esConsumoDiarioCampamento =
      input.motivo?.trim() === MOTIVO_EGRESO_CONSUMO_DIARIO
    const esProduccionCocina =
      input.motivo?.trim() === MOTIVO_EGRESO_PRODUCCION_COCINA

    const transporte = normalizarTransporte(input.transporte)
    if (
      !esConsumoDiarioCampamento &&
      !esProduccionCocina &&
      requiereDatosTransporte(destino)
    ) {
      if (!transporte?.chofer) throw new Error('Indicá el nombre del chofer.')
      if (!transporte.patente) throw new Error('Indicá la patente del vehículo.')
      if (!transporte.precinto) throw new Error('Indicá el número de precinto.')
    }

    const baseItems = normalizarItems(input.items, 'EGRESO')
    if (baseItems.length === 0) {
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

    await runTransaction(db, async (t) => {
      const items = await congelarCostoPorUnidadBaseEnTransaccion(
        t,
        db,
        baseItems,
      )
      const agg = agregarItemsEgresoPorSaldo(db, ubicacionId, items)
      const filas = [...agg.values()]

      const snaps = await Promise.all(filas.map((row) => t.get(row.ref)))

      for (let i = 0; i < filas.length; i++) {
        const row = filas[i]
        const snap = snaps[i]
        const disponible = snap.exists()
          ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
          : 0
        if (disponible + 1e-9 < row.cantidad) {
          const sinSaldo =
            !snap.exists() || disponible === 0
              ? ' Ejecutá «Recalcular saldos desde movimientos» en Configuración del depósito si acabas de migrar.'
              : ''
          throw new Error(
            `Stock insuficiente en servidor para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, solicitado: ${row.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.${sinSaldo}`,
          )
        }
      }

      t.set(movRef, {
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

      for (const row of filas) {
        t.set(
          row.ref,
          {
            ubicacionId,
            insumoId: row.insumoId,
            loteKey: row.loteKey,
            cantidad: increment(-row.cantidad),
            actualizadoEn: serverTimestamp(),
          },
          { merge: true },
        )
      }
    })
    return movRef.id
  }

  if (input.tipo === 'DECOMISO') {
    const motivo = input.motivo.trim()
    if (!motivo) throw new Error('Indicá el motivo.')

    const baseItems = normalizarItems(input.items, 'DECOMISO')
    if (baseItems.length === 0) {
      throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
    }

    const ubicacionId = UBICACION_DEPOSITO_CENTRAL

    await runTransaction(db, async (t) => {
      const items = await congelarCostoPorUnidadBaseEnTransaccion(
        t,
        db,
        baseItems,
      )
      const agg = agregarItemsEgresoPorSaldo(db, ubicacionId, items)
      const filas = [...agg.values()]
      const snaps = await Promise.all(filas.map((row) => t.get(row.ref)))

      for (let i = 0; i < filas.length; i++) {
        const row = filas[i]
        const snap = snaps[i]
        const disponible = snap.exists()
          ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
          : 0
        if (disponible + 1e-9 < row.cantidad) {
          const sinSaldo =
            !snap.exists() || disponible === 0
              ? ' Ejecutá «Recalcular saldos desde movimientos» en Configuración del depósito si acabas de migrar.'
              : ''
          throw new Error(
            `Stock insuficiente en servidor para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, solicitado: ${row.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.${sinSaldo}`,
          )
        }
      }

      t.set(movRef, {
        tipo: 'DECOMISO' as const,
        fecha: fechaTs,
        motivo,
        ubicacionId,
        items: items.map((it) => itemToFirestore(it, false)),
        creadoEn: serverTimestamp(),
      })

      for (const row of filas) {
        t.set(
          row.ref,
          {
            ubicacionId,
            insumoId: row.insumoId,
            loteKey: row.loteKey,
            cantidad: increment(-row.cantidad),
            actualizadoEn: serverTimestamp(),
          },
          { merge: true },
        )
      }
    })
    return movRef.id
  }

  if (input.tipo === 'AJUSTE') {
    const motivo = input.motivo.trim()
    if (!motivo) throw new Error('Indicá el motivo.')

    const items = normalizarItems(input.items, 'AJUSTE')
    if (items.length === 0) {
      throw new Error('Agregá al menos un ítem válido con insumo y cantidad.')
    }

    const ubicacionId = UBICACION_DEPOSITO_CENTRAL

    await runTransaction(db, async (t) => {
      const deltas = agregarNetDeltaAjustePorSaldo(db, items)
      const negativos = [...deltas.values()].filter((d) => d.netDelta < 0)
      const snapsNeg = await Promise.all(negativos.map((d) => t.get(d.ref)))

      for (let i = 0; i < negativos.length; i++) {
        const row = negativos[i]
        const snap = snapsNeg[i]
        const disponible = snap.exists()
          ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
          : 0
        const necesita = Math.abs(row.netDelta)
        if (disponible + 1e-9 < necesita) {
          throw new Error(
            `Ajuste inválido: stock insuficiente para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, ajuste: ${row.netDelta.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.`,
          )
        }
      }

      t.set(movRef, {
        tipo: 'AJUSTE' as const,
        fecha: fechaTs,
        motivo,
        ubicacionId,
        items: items.map((it) => itemToFirestore(it, false)),
        creadoEn: serverTimestamp(),
      })

      for (const d of deltas.values()) {
        if (d.netDelta === 0) continue
        t.set(
          d.ref,
          {
            ubicacionId,
            insumoId: d.insumoId,
            loteKey: d.loteKey,
            cantidad: increment(d.netDelta),
            actualizadoEn: serverTimestamp(),
          },
          { merge: true },
        )
      }
    })
    return movRef.id
  }

  throw new Error('Tipo de movimiento no soportado.')
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
  opciones: OpcionesSuscripcionMovimientos = {},
): Unsubscribe {
  const db = getDb()
  const q = construirQueryMovimientosTodos(db, opciones)
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
  opciones: OpcionesSuscripcionMovimientos = {},
): Unsubscribe {
  const db = getDb()
  const q = construirQueryMovimientosUbicacion(db, ubicacionId, opciones)
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
 * Reconstruye documentos en `saldo_lotes` a partir de todo el historial de movimientos.
 * Ejecutar tras desplegar saldos por lote o si hubo inconsistencias.
 */
export async function rebuildSaldoLotesDesdeMovimientos(): Promise<void> {
  const db = getDb()
  const snap = await getDocs(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const acum = new Map<
    string,
    { ubicacionId: string; insumoId: string; loteKey: string; cantidad: number }
  >()

  for (const d of snap.docs) {
    const m = mapMovimientoDoc(d.id, d.data() as Record<string, unknown>)
    if (!m) continue
    const ub = ubicacionEfectivaMovimiento(m)
    for (const it of m.items) {
      const lk = normalizarLoteKey(it.lote)
      const key = saldoLoteDocumentId(ub, it.insumoId, lk)
      const qty = Number(it.cantidad)
      if (!Number.isFinite(qty)) continue
      let delta = 0
      if (m.tipo === 'INGRESO') delta = Math.abs(qty)
      else if (m.tipo === 'EGRESO' || m.tipo === 'DECOMISO') delta = -Math.abs(qty)
      else if (m.tipo === 'AJUSTE') delta = qty
      const prev = acum.get(key)
      const cantidad = (prev?.cantidad ?? 0) + delta
      acum.set(key, {
        ubicacionId: ub,
        insumoId: it.insumoId,
        loteKey: lk,
        cantidad,
      })
    }
  }

  let batch = writeBatch(db)
  let ops = 0
  for (const [key, v] of acum) {
    const cantidad = Math.max(0, v.cantidad)
    const ref = doc(db, COLLECTION_SALDO_LOTES, key)
    batch.set(ref, {
      ubicacionId: v.ubicacionId,
      insumoId: v.insumoId,
      loteKey: v.loteKey,
      cantidad,
      actualizadoEn: serverTimestamp(),
    })
    ops++
    if (ops >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
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
  const ingresoRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))

  await runTransaction(db, async (t) => {
    const egresoSnap = await t.get(egresoRef)
    if (!egresoSnap.exists()) throw new Error('No se encontró el movimiento de egreso.')

    const mov = mapMovimientoDoc(
      egresoId,
      egresoSnap.data() as Record<string, unknown>,
    )
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

    const fechaRecepcion = Timestamp.fromDate(new Date())
    const numeroRc = `RC-${mov.numeroDocumento}-${egresoId.slice(0, 8)}`
    const ubicacionIngreso = ubicacionRecepcionId.trim().toUpperCase()

    t.update(egresoRef, {
      estadoTraslado: 'RECIBIDO',
      recibidoEn: serverTimestamp(),
    })
    t.set(ingresoRef, {
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

    for (const it of itemsIngreso) {
      const qty = Math.abs(Number(it.cantidad))
      if (qty <= 0) continue
      const lk = normalizarLoteKey(it.lote)
      const sref = refSaldoLote(db, ubicacionIngreso, it.insumoId, lk)
      t.set(
        sref,
        {
          ubicacionId: ubicacionIngreso,
          insumoId: it.insumoId,
          loteKey: lk,
          cantidad: increment(qty),
          actualizadoEn: serverTimestamp(),
        },
        { merge: true },
      )
    }
  })
}

export interface ProduccionCocinaRegistro {
  id: string
  fecha: Date | null
  ubicacionId: string
  recetaId: string
  recetaNombre: string
  cantidadPorciones: number
  insumoProductoId: string
  nombreProducto: string
  costoTeorico: number
  costoReal: number
  desvioPorcentaje: number
  egresoId: string
  ingresoId: string
}

function mapProduccionCocinaDoc(
  id: string,
  data: Record<string, unknown>,
): ProduccionCocinaRegistro | null {
  const fechaRaw = data.fecha
  let fecha: Date | null = null
  if (fechaRaw instanceof Timestamp) fecha = fechaRaw.toDate()

  const ubicacionId =
    typeof data.ubicacionId === 'string' ? data.ubicacionId.trim().toUpperCase() : ''
  const recetaId = typeof data.recetaId === 'string' ? data.recetaId.trim() : ''
  const recetaNombre =
    typeof data.recetaNombre === 'string' ? data.recetaNombre.trim() : '—'
  const insumoProductoId =
    typeof data.insumoProductoId === 'string' ? data.insumoProductoId.trim() : ''
  const nombreProducto =
    typeof data.nombreProducto === 'string' ? data.nombreProducto.trim() : '—'

  const cantidadPorciones = Number(data.cantidadPorciones)
  const costoTeorico = Number(data.costoTeorico)
  const costoReal = Number(data.costoReal)
  const desvioPorcentaje = Number(data.desvioPorcentaje)

  const egresoId = typeof data.egresoId === 'string' ? data.egresoId.trim() : ''
  const ingresoId = typeof data.ingresoId === 'string' ? data.ingresoId.trim() : ''

  if (!ubicacionId || !recetaId || !egresoId || !ingresoId) return null

  return {
    id,
    fecha,
    ubicacionId,
    recetaId,
    recetaNombre,
    cantidadPorciones: Number.isFinite(cantidadPorciones) ? cantidadPorciones : 0,
    insumoProductoId,
    nombreProducto,
    costoTeorico: Number.isFinite(costoTeorico) ? costoTeorico : 0,
    costoReal: Number.isFinite(costoReal) ? costoReal : 0,
    desvioPorcentaje: Number.isFinite(desvioPorcentaje) ? desvioPorcentaje : 0,
    egresoId,
    ingresoId,
  }
}

/** Historial de producción en cocina (eficiencia de receta / auditoría). */
export function subscribeProduccionCocinaRegistros(
  onChange: (rows: ProduccionCocinaRegistro[]) => void,
  limite = 500,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_PRODUCCION_COCINA),
    orderBy('fecha', 'desc'),
    limit(Math.min(Math.max(1, limite), FIRESTORE_QUERY_LIMIT_MAX)),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: ProduccionCocinaRegistro[] = []
      snap.forEach((d) => {
        const m = mapProduccionCocinaDoc(d.id, d.data() as Record<string, unknown>)
        if (m) rows.push(m)
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeProduccionCocinaRegistros', err)
      onChange([])
    },
  )
}

/**
 * Producción en cocina: un egreso de insumos y un ingreso de producto terminado,
 * más registro de auditoría, en una sola transacción (incluye `saldo_lotes`).
 */
export async function registrarProduccionCocina(input: {
  ubicacionId: string
  fecha: Date
  recetaId: string
  recetaNombre: string
  cantidadPorciones: number
  insumoProductoId: string
  nombreProductoSnapshot: string
  loteProductoTerminado: string
  /** Ítems de egreso con lote y cantidades reales (unidad base del insumo). */
  itemsEgreso: ItemMovimientoInventario[]
  costoTeoricoTotal: number
}): Promise<{ egresoId: string; ingresoId: string; registroId: string }> {
  const db = getDb()
  const ub = input.ubicacionId.trim().toUpperCase()
  if (!ub) throw new Error('Ubicación inválida.')

  const nPorciones = Number(input.cantidadPorciones)
  if (!Number.isFinite(nPorciones) || nPorciones <= 0) {
    throw new Error('Indicá una cantidad de porciones producida mayor a cero.')
  }

  const insumoProdId = input.insumoProductoId.trim()
  if (!insumoProdId) throw new Error('Seleccioná el insumo de producto terminado.')

  const nombreProd = input.nombreProductoSnapshot.trim()
  if (!nombreProd) throw new Error('Nombre de producto inválido.')

  const loteProd = input.loteProductoTerminado.trim()
  if (!loteProd) throw new Error('Lote de producto terminado inválido.')

  const baseEgreso = normalizarItems(input.itemsEgreso, 'EGRESO')
  if (baseEgreso.length === 0) {
    throw new Error('Indicá al menos un insumo consumido con cantidad mayor a cero.')
  }

  const egresoRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const ingresoRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const prodRef = doc(collection(db, COLLECTION_PRODUCCION_COCINA))

  const fechaTs = Timestamp.fromDate(input.fecha)
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase()
  const numeroEgreso = `PRD-EGR-${Date.now()}-${rnd}`
  const numeroIngreso = `PRD-ING-${Date.now()}-${rnd}`

  await runTransaction(db, async (t) => {
    const itemsEgreso = await congelarCostoPorUnidadBaseEnTransaccion(t, db, baseEgreso)
    const agg = agregarItemsEgresoPorSaldo(db, ub, itemsEgreso)
    const filas = [...agg.values()]
    const snaps = await Promise.all(filas.map((row) => t.get(row.ref)))

    for (let i = 0; i < filas.length; i++) {
      const row = filas[i]
      const snap = snaps[i]
      const disponible = snap.exists()
        ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
        : 0
      if (disponible + 1e-9 < row.cantidad) {
        throw new Error(
          `Stock insuficiente para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, solicitado: ${row.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.`,
        )
      }
    }

    const costoReal = costoTotalItemsMovimiento(itemsEgreso)
    const costoTeorico = clampNonNegative(Number(input.costoTeoricoTotal))
    const desvioPorcentaje =
      costoTeorico > 1e-9
        ? ((costoReal - costoTeorico) / costoTeorico) * 100
        : costoReal > 0
          ? 100
          : 0

    const insumoProdSnap = await t.get(doc(db, COLLECTION_INSUMOS, insumoProdId))
    if (!insumoProdSnap.exists()) {
      throw new Error('El insumo de producto terminado no existe en el catálogo.')
    }
    const insRaw = insumoProdSnap.data() as Record<string, unknown>
    const costoUnitProd = clampNonNegative(Number(insRaw.costoPorUnidadBase))

    const itemProducto: ItemMovimientoInventario = {
      insumoId: insumoProdId,
      nombreSnapshot: nombreProd,
      cantidad: nPorciones,
      lote: loteProd,
      controlCalidadOk: true,
      costoPorUnidadBaseSnapshot: costoUnitProd,
    }
    const itemsIngreso = normalizarItems([itemProducto], 'INGRESO')
    if (itemsIngreso.length === 0) {
      throw new Error('No se pudo normalizar el ingreso de producto terminado.')
    }

    t.set(egresoRef, {
      tipo: 'EGRESO' as const,
      fecha: fechaTs,
      destino: DESTINO_EGRESO_PRODUCCION_COCINA,
      numeroDocumento: numeroEgreso,
      ubicacionId: ub,
      motivo: MOTIVO_EGRESO_PRODUCCION_COCINA,
      observacionesComanda: `Receta: ${input.recetaNombre.trim()} · ${input.recetaId}`,
      items: itemsEgreso.map((it) => itemToFirestore(it, false)),
      creadoEn: serverTimestamp(),
    })

    for (const row of filas) {
      t.set(
        row.ref,
        {
          ubicacionId: ub,
          insumoId: row.insumoId,
          loteKey: row.loteKey,
          cantidad: increment(-row.cantidad),
          actualizadoEn: serverTimestamp(),
        },
        { merge: true },
      )
    }

    t.set(ingresoRef, {
      tipo: 'INGRESO' as const,
      fecha: fechaTs,
      proveedor: 'Producción cocina central',
      tipoDocumento: 'Remito' as const,
      numeroDocumento: numeroIngreso,
      ubicacionId: ub,
      items: itemsIngreso.map((it) => itemToFirestore(it, true)),
      creadoEn: serverTimestamp(),
    })

    for (const it of itemsIngreso) {
      const qty = Math.abs(Number(it.cantidad))
      if (qty <= 0) continue
      const lk = normalizarLoteKey(it.lote)
      const sref = refSaldoLote(db, ub, it.insumoId, lk)
      t.set(
        sref,
        {
          ubicacionId: ub,
          insumoId: it.insumoId,
          loteKey: lk,
          cantidad: increment(qty),
          actualizadoEn: serverTimestamp(),
        },
        { merge: true },
      )
    }

    t.set(prodRef, {
      fecha: fechaTs,
      ubicacionId: ub,
      recetaId: input.recetaId.trim(),
      recetaNombre: input.recetaNombre.trim(),
      cantidadPorciones: nPorciones,
      insumoProductoId: insumoProdId,
      nombreProducto: nombreProd,
      costoTeorico,
      costoReal,
      desvioPorcentaje,
      egresoId: egresoRef.id,
      ingresoId: ingresoRef.id,
      creadoEn: serverTimestamp(),
    })
  })

  return { egresoId: egresoRef.id, ingresoId: ingresoRef.id, registroId: prodRef.id }
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
