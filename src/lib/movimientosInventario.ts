import {
  collection,
  doc,
  getDoc,
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
  type DocumentReference,
  type DocumentSnapshot,
  type QueryConstraint,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { COLLECTION_INSUMOS, computeCostoPorUnidadBase } from './insumos'
import { getDb } from './firebase'
import { aplicarStockMenuProduccionEnData } from './menu'
import { COLLECTION_SOLICITUDES } from './solicitudesMercaderia'

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
  /**
   * Solo aplica en `subscribeMovimientosInventarioPorUbicacion`:
   * si es `true`, se omiten filtros por `ubicacionId` y se usa la misma consulta global que
   * `subscribeMovimientosInventario` (p. ej. roles `analista` / `gerencia`; ver `esRolVisionGlobalLectura` en `rbac.ts`).
   */
  visionGlobal?: boolean
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

/** Expuesto para integración Módulo Compras → recepción OC. */
export { refSaldoLote as refSaldoLoteInventario }

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

export type EstadoTrasladoInventario = 'EN_TRANSITO' | 'RECIBIDO' | 'RECHAZADO'

/** Ítem de movimiento (trazabilidad HACCP); permite congelar costo histórico por unidad base. */
export interface ItemMovimientoInventario {
  insumoId: string
  nombreSnapshot: string
  /** Siempre en unidad base (Kg, Lt, Un) tras normalizar. */
  cantidad: number
  lote?: string
  fechaVencimiento?: string | null
  temperatura?: string
  controlCalidadOk: boolean
  precioUnitarioFacturado?: number
  costoPorUnidadBaseSnapshot?: number
  /** Trazabilidad del empaque usado en pantalla (remito operativo). */
  presentacionUsada?: string
  /** Cantidad ingresada antes de multiplicar por el factor del empaque. */
  cantidadOriginal?: number
  factorPresentacion?: number
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

export interface RecepcionLineaOrdenCompra {
  lineaId: string
  insumoId: string
  cantidadRecibida: number
}

export interface MovimientoIngreso extends MovimientoBase {
  tipo: 'INGRESO'
  proveedor: string
  tipoDocumento: TipoDocumentoRecepcion
  numeroDocumento: string
  /** Egreso de origen si este ingreso cierra un traslado interno. */
  egresoTrasladoOrigenId?: string
  /** Vínculo con Módulo A (Compras). */
  ordenCompraId?: string
  ordenCompraNumero?: string
  recepcionLineas?: RecepcionLineaOrdenCompra[]
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
  /** Cuando la sucursal rechaza el remito en destino. */
  rechazadoEn?: Date | null
  motivoRechazo?: string
  /** Vínculo con `solicitudes_mercaderia` si el egreso cierra un pedido. */
  solicitudId?: string
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
      /** Si se informa, al confirmar el egreso la solicitud pasa a «Enviado» en la misma transacción. */
      solicitudId?: string
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

/**
 * Destino de egreso y código de ubicación destino a partir de quién solicitó mercadería.
 */
export function destinoEgresoYUbicacionDesdeSolicitante(
  ubicacionSolicitanteId?: string | null,
): { destinoEgreso: string; ubicacionDestino: string } {
  const u = ubicacionSolicitanteId?.trim().toUpperCase() ?? ''
  if (u === UBICACION_CAMPAMENTO_CASPOSO) {
    return { destinoEgreso: 'Campamento Casposo', ubicacionDestino: UBICACION_CAMPAMENTO_CASPOSO }
  }
  return { destinoEgreso: 'Cocina Central', ubicacionDestino: UBICACION_COCINA_CENTRAL }
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

  const cantidadOriginal =
    o.cantidadOriginal != null ? Number(o.cantidadOriginal) : undefined
  const factorPresentacion =
    o.factorPresentacion != null ? Number(o.factorPresentacion) : undefined
  const presentacionUsada =
    typeof o.presentacionUsada === 'string' ? o.presentacionUsada.trim() : undefined

  let cantidadBase = cantidad
  if (
    cantidadOriginal != null &&
    Number.isFinite(cantidadOriginal) &&
    factorPresentacion != null &&
    Number.isFinite(factorPresentacion) &&
    factorPresentacion > 0
  ) {
    cantidadBase = cantidadOriginal * factorPresentacion
  }

  if (!insumoId || !nombreSnapshot || !Number.isFinite(cantidadBase)) return null

  if (movTipo === 'AJUSTE') {
    if (cantidadBase === 0) return null
  } else if (cantidadBase <= 0) return null

  return {
    insumoId,
    nombreSnapshot,
    cantidad: cantidadBase,
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
    ...(presentacionUsada ? { presentacionUsada } : {}),
    ...(cantidadOriginal != null &&
    Number.isFinite(cantidadOriginal) &&
    cantidadOriginal > 0
      ? { cantidadOriginal }
      : {}),
    ...(factorPresentacion != null &&
    Number.isFinite(factorPresentacion) &&
    factorPresentacion > 0
      ? { factorPresentacion }
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
  if (v === 'EN_TRANSITO' || v === 'RECIBIDO' || v === 'RECHAZADO') return v
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
    const ordenCompraId =
      typeof data.ordenCompraId === 'string' && data.ordenCompraId.trim()
        ? data.ordenCompraId.trim()
        : undefined
    const ordenCompraNumero =
      typeof data.ordenCompraNumero === 'string' && data.ordenCompraNumero.trim()
        ? data.ordenCompraNumero.trim()
        : undefined
    const recepcionLineasRaw = data.recepcionLineas
    const recepcionLineas = Array.isArray(recepcionLineasRaw)
      ? recepcionLineasRaw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const r = row as Record<string, unknown>
            const lineaId = typeof r.lineaId === 'string' ? r.lineaId.trim() : ''
            const insumoId = typeof r.insumoId === 'string' ? r.insumoId.trim() : ''
            const cantidadRecibida = Number(r.cantidadRecibida)
            if (!lineaId || !insumoId || !Number.isFinite(cantidadRecibida)) return null
            return { lineaId, insumoId, cantidadRecibida }
          })
          .filter((x): x is RecepcionLineaOrdenCompra => x != null)
      : undefined
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
      ...(ordenCompraId ? { ordenCompraId } : {}),
      ...(ordenCompraNumero ? { ordenCompraNumero } : {}),
      ...(recepcionLineas && recepcionLineas.length > 0 ? { recepcionLineas } : {}),
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
    const rechazadoEnRaw = data.rechazadoEn
    let rechazadoEn: Date | null = null
    if (rechazadoEnRaw instanceof Timestamp) rechazadoEn = rechazadoEnRaw.toDate()
    const motivoRechazo =
      typeof data.motivoRechazo === 'string' && data.motivoRechazo.trim()
        ? data.motivoRechazo.trim()
        : undefined
    const solicitudIdRaw = data.solicitudId
    const solicitudId =
      typeof solicitudIdRaw === 'string' && solicitudIdRaw.trim().length > 0
        ? solicitudIdRaw.trim()
        : undefined
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
      ...(rechazadoEn ? { rechazadoEn } : {}),
      ...(motivoRechazo ? { motivoRechazo } : {}),
      ...(solicitudId ? { solicitudId } : {}),
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
    ...(it.presentacionUsada?.trim()
      ? { presentacionUsada: it.presentacionUsada.trim() }
      : {}),
    ...(it.cantidadOriginal != null &&
    Number.isFinite(it.cantidadOriginal) &&
    it.cantidadOriginal > 0
      ? { cantidadOriginal: it.cantidadOriginal }
      : {}),
    ...(it.factorPresentacion != null &&
    Number.isFinite(it.factorPresentacion) &&
    it.factorPresentacion > 0
      ? { factorPresentacion: it.factorPresentacion }
      : {}),
  }
}

async function congelarCostoPorUnidadBaseConLecturas(
  obtener: (ref: DocumentReference) => Promise<DocumentSnapshot>,
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
    faltantes.map((id) => obtener(doc(db, COLLECTION_INSUMOS, id))),
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

async function congelarCostoPorUnidadBaseEnTransaccion(
  transaction: Transaction,
  db: ReturnType<typeof getDb>,
  items: ItemMovimientoInventario[],
): Promise<ItemMovimientoInventario[]> {
  return congelarCostoPorUnidadBaseConLecturas(
    (ref) => transaction.get(ref),
    db,
    items,
  )
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
    const solicitudIdTrim = input.solicitudId?.trim()

    /** Comandas / egresos de producción en cocina: sin red usamos batch (cola local) en lugar de transacción. */
    const usarEgresoEnColaLocal =
      typeof navigator !== 'undefined' &&
      !navigator.onLine &&
      (esConsumoDiarioCampamento || esProduccionCocina)

    if (usarEgresoEnColaLocal) {
      let solicitudRefOffline: ReturnType<typeof doc> | null = null
      if (solicitudIdTrim) {
        solicitudRefOffline = doc(db, COLLECTION_SOLICITUDES, solicitudIdTrim)
        const sSnap = await getDoc(solicitudRefOffline)
        if (!sSnap.exists()) {
          throw new Error(
            'Sin conexión: la solicitud no está en la caché local. Conectate una vez con WiFi antes de despachar contra esa solicitud.',
          )
        }
        const sd = sSnap.data() as Record<string, unknown>
        const st = typeof sd.estado === 'string' ? sd.estado : ''
        if (st !== 'Pendiente' && st !== 'En Preparación') {
          throw new Error(
            'La solicitud ya no admite despacho (solo pendientes o en preparación).',
          )
        }
      }

      const itemsOffline = await congelarCostoPorUnidadBaseConLecturas(
        (ref) => getDoc(ref),
        db,
        baseItems,
      )
      const aggOffline = agregarItemsEgresoPorSaldo(db, ubicacionId, itemsOffline)
      const filasOffline = [...aggOffline.values()]
      const snapsOffline = await Promise.all(
        filasOffline.map((row) => getDoc(row.ref)),
      )

      for (let i = 0; i < filasOffline.length; i++) {
        const row = filasOffline[i]
        const snap = snapsOffline[i]
        const disponible = snap.exists()
          ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
          : 0
        if (disponible + 1e-9 < row.cantidad) {
          const sinSaldo =
            !snap.exists() || disponible === 0
              ? ' Abrí el inventario con conexión al menos una vez para descargar saldos en esta máquina.'
              : ''
          throw new Error(
            `Stock insuficiente o sin datos locales para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible en caché: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, solicitado: ${row.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.${sinSaldo}`,
          )
        }
      }

      const batchEgreso = writeBatch(db)
      batchEgreso.set(movRef, {
        tipo: 'EGRESO' as const,
        fecha: fechaTs,
        destino,
        numeroDocumento,
        ubicacionId,
        ...(transporte ? { transporte } : {}),
        ...(motivoTrim ? { motivo: motivoTrim } : {}),
        ...(obsComandaTrim ? { observacionesComanda: obsComandaTrim } : {}),
        items: itemsOffline.map((it) => itemToFirestore(it, false)),
        creadoEn: serverTimestamp(),
        ...(solicitudIdTrim ? { solicitudId: solicitudIdTrim } : {}),
        ...(esTraslado && ubicacionDestinoInferida
          ? {
              ubicacionDestino: ubicacionDestinoInferida,
              estadoTraslado: 'EN_TRANSITO' as const,
            }
          : {}),
      })

      if (solicitudRefOffline) {
        batchEgreso.update(solicitudRefOffline, { estado: 'Enviado' })
      }

      for (const row of filasOffline) {
        batchEgreso.set(
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
      await batchEgreso.commit()
      return movRef.id
    }

    await runTransaction(db, async (t) => {
      let solicitudRef: ReturnType<typeof doc> | null = null
      if (solicitudIdTrim) {
        solicitudRef = doc(db, COLLECTION_SOLICITUDES, solicitudIdTrim)
        const sSnap = await t.get(solicitudRef)
        if (!sSnap.exists()) {
          throw new Error('La solicitud vinculada no existe.')
        }
        const sd = sSnap.data() as Record<string, unknown>
        const st = typeof sd.estado === 'string' ? sd.estado : ''
        if (st !== 'Pendiente' && st !== 'En Preparación') {
          throw new Error(
            'La solicitud ya no admite despacho (solo pendientes o en preparación).',
          )
        }
      }

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
              ? ' Verificá que haya un ingreso con ese lote en depósito central.'
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
        ...(solicitudIdTrim ? { solicitudId: solicitudIdTrim } : {}),
        ...(esTraslado && ubicacionDestinoInferida
          ? {
              ubicacionDestino: ubicacionDestinoInferida,
              estadoTraslado: 'EN_TRANSITO' as const,
            }
          : {}),
      })

      if (solicitudRef) {
        t.update(solicitudRef, { estado: 'Enviado' })
      }

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
              ? ' Verificá que haya un ingreso con ese lote en depósito central.'
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
    let cantidad = Number(it.cantidad)
    const cantidadOriginal =
      it.cantidadOriginal != null ? Number(it.cantidadOriginal) : undefined
    const factorPresentacion =
      it.factorPresentacion != null ? Number(it.factorPresentacion) : undefined
    if (
      cantidadOriginal != null &&
      Number.isFinite(cantidadOriginal) &&
      factorPresentacion != null &&
      Number.isFinite(factorPresentacion) &&
      factorPresentacion > 0
    ) {
      cantidad = cantidadOriginal * factorPresentacion
    }
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
    const presentacionUsada = it.presentacionUsada?.trim()
    if (presentacionUsada) row.presentacionUsada = presentacionUsada
    if (
      cantidadOriginal != null &&
      Number.isFinite(cantidadOriginal) &&
      cantidadOriginal !== 0
    ) {
      row.cantidadOriginal = cantidadOriginal
    }
    if (
      factorPresentacion != null &&
      Number.isFinite(factorPresentacion) &&
      factorPresentacion > 0
    ) {
      row.factorPresentacion = factorPresentacion
    }
    out.push(row)
  }
  return out
}

/** Integración Módulo Compras → recepción OC en depósito. */
export function serializarItemMovimientoInventario(
  it: ItemMovimientoInventario,
  incluirPrecio: boolean,
) {
  return itemToFirestore(it, incluirPrecio)
}

/** Integración Módulo Compras → recepción OC en depósito. */
export function normalizarItemsMovimientoInventario(
  rawItems: ItemMovimientoInventario[],
  movTipo: TipoMovimientoInventario,
): ItemMovimientoInventario[] {
  return normalizarItems(rawItems, movTipo)
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

/** Fila materializada de `saldo_lotes` (stock por ubicación / insumo / lote). */
export type SaldoLoteResumen = {
  id: string
  ubicacionId: string
  insumoId: string
  loteKey: string
  cantidad: number
}

/**
 * Suscripción en vivo a toda la colección `saldo_lotes` (uso típico: BI / valorización).
 * Ojo costo Firestore si el volumen de documentos crece mucho.
 */
export function subscribeSaldoLotes(onChange: (rows: SaldoLoteResumen[]) => void): Unsubscribe {
  const db = getDb()
  return onSnapshot(
    collection(db, COLLECTION_SALDO_LOTES),
    (snap) => {
      const rows: SaldoLoteResumen[] = []
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const cantidad = Number(data.cantidad)
        if (!Number.isFinite(cantidad) || cantidad <= 0) return
        const ubicacionId =
          typeof data.ubicacionId === 'string' ? data.ubicacionId.trim().toUpperCase() : ''
        const insumoId = typeof data.insumoId === 'string' ? data.insumoId.trim() : ''
        const loteKey = typeof data.loteKey === 'string' ? data.loteKey.trim() : ''
        if (!insumoId) return
        rows.push({
          id: d.id,
          ubicacionId,
          insumoId,
          loteKey,
          cantidad,
        })
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeSaldoLotes', err)
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
  if (opciones.visionGlobal) {
    const { visionGlobal: _omit, ...rest } = opciones
    return subscribeMovimientosInventario(onChange, rest)
  }
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
  observacionesRecepcion?: string
}): Promise<void> {
  const { egresoId, ubicacionRecepcionId, itemsRecibidos, observacionesRecepcion } =
    input
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

    if (mov.solicitudId) {
      const solicitudRef = doc(db, COLLECTION_SOLICITUDES, mov.solicitudId)
      t.update(solicitudRef, {
        estado: 'Recibido',
        observacionesRecepcion: (observacionesRecepcion ?? '').trim(),
      })
    }
  })
}

/**
 * Rechaza un remito en tránsito: devuelve stock al depósito emisor y marca la solicitud vinculada.
 */
export async function rechazarRecepcionTrasladoCampamento(input: {
  egresoId: string
  ubicacionRecepcionId: string
  motivoRechazo: string
}): Promise<void> {
  const { egresoId, ubicacionRecepcionId, motivoRechazo } = input
  const motivo = motivoRechazo.trim()
  if (!motivo) throw new Error('Indicá el motivo del rechazo.')

  const db = getDb()
  const egresoRef = doc(db, COLLECTION_MOVIMIENTOS_INVENTARIO, egresoId)

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

    const ubicacionDeposito = ubicacionEfectivaMovimiento(mov)
    const agg = agregarItemsEgresoPorSaldo(db, ubicacionDeposito, mov.items)

    t.update(egresoRef, {
      estadoTraslado: 'RECHAZADO',
      rechazadoEn: serverTimestamp(),
      motivoRechazo: motivo,
    })

    for (const row of agg.values()) {
      t.set(
        row.ref,
        {
          ubicacionId: ubicacionDeposito,
          insumoId: row.insumoId,
          loteKey: row.loteKey,
          cantidad: increment(row.cantidad),
          actualizadoEn: serverTimestamp(),
        },
        { merge: true },
      )
    }

    if (mov.solicitudId) {
      const solicitudRef = doc(db, COLLECTION_SOLICITUDES, mov.solicitudId)
      t.update(solicitudRef, {
        estado: 'Rechazado',
        observacionesRecepcion: motivo,
      })
    }
  })
}

export interface ProduccionInsumoDetalle {
  insumoId: string
  nombre: string
  unidad: string
  cantidadTeorica: number
  cantidadReal: number
  loteInsumo: string
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
  loteProducto: string
  fechaVencimiento: string
  codigoTrazabilidad: string
  menuItemId: string | null
  /** Guarnición asociada a la vianda (solo modalidad V-). */
  nombreGuarnicion?: string
  guarnicionMenuItemId?: string | null
  itemsDetalle: ProduccionInsumoDetalle[]
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

  const loteProducto =
    typeof data.loteProducto === 'string' ? data.loteProducto.trim() : ''
  const fechaVencimiento =
    typeof data.fechaVencimiento === 'string' ? data.fechaVencimiento.trim() : ''
  const codigoTrazabilidad =
    typeof data.codigoTrazabilidad === 'string' ? data.codigoTrazabilidad.trim() : ''
  const menuItemIdRaw = data.menuItemId
  const menuItemId =
    typeof menuItemIdRaw === 'string' && menuItemIdRaw.trim() ? menuItemIdRaw.trim() : null
  const nombreGuarnicion =
    typeof data.nombreGuarnicion === 'string' ? data.nombreGuarnicion.trim() : ''
  const guarnicionMenuItemIdRaw = data.guarnicionMenuItemId
  const guarnicionMenuItemId =
    typeof guarnicionMenuItemIdRaw === 'string' && guarnicionMenuItemIdRaw.trim()
      ? guarnicionMenuItemIdRaw.trim()
      : null

  const itemsDetalle: ProduccionInsumoDetalle[] = []
  if (Array.isArray(data.itemsDetalle)) {
    for (const row of data.itemsDetalle) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const insumoId = typeof o.insumoId === 'string' ? o.insumoId.trim() : ''
      const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : '—'
      const unidad = typeof o.unidad === 'string' ? o.unidad.trim() : ''
      const cantidadTeorica = Number(o.cantidadTeorica)
      const cantidadReal = Number(o.cantidadReal)
      const loteInsumo = typeof o.loteInsumo === 'string' ? o.loteInsumo.trim() : ''
      if (!insumoId) continue
      itemsDetalle.push({
        insumoId,
        nombre,
        unidad,
        cantidadTeorica: Number.isFinite(cantidadTeorica) ? cantidadTeorica : 0,
        cantidadReal: Number.isFinite(cantidadReal) ? cantidadReal : 0,
        loteInsumo,
      })
    }
  }

  if (!ubicacionId || !recetaId || !egresoId) return null

  return {
    id,
    fecha,
    ubicacionId,
    recetaId,
    recetaNombre,
    cantidadPorciones: Number.isFinite(cantidadPorciones) ? cantidadPorciones : 0,
    insumoProductoId,
    nombreProducto,
    loteProducto,
    fechaVencimiento,
    codigoTrazabilidad,
    menuItemId,
    ...(nombreGuarnicion ? { nombreGuarnicion } : {}),
    ...(guarnicionMenuItemId ? { guarnicionMenuItemId } : {}),
    itemsDetalle,
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

export async function fetchProduccionCocinaById(
  id: string,
): Promise<ProduccionCocinaRegistro | null> {
  const db = getDb()
  const snap = await getDoc(doc(db, COLLECTION_PRODUCCION_COCINA, id.trim()))
  if (!snap.exists()) return null
  return mapProduccionCocinaDoc(snap.id, snap.data() as Record<string, unknown>)
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
  insumoProductoId?: string
  nombreProductoSnapshot: string
  loteProductoTerminado: string
  fechaVencimientoProducto: string
  codigoTrazabilidad: string
  menuItemId?: string | null
  /** Menú de la guarnición cuando la vianda es principal + guarnición. */
  guarnicionMenuItemId?: string | null
  /** Nombre de guarnición para etiqueta de vianda. */
  nombreGuarnicion?: string | null
  itemsDetalle?: ProduccionInsumoDetalle[]
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

  const insumoProdId = input.insumoProductoId?.trim() ?? ''
  const nombreProd = input.nombreProductoSnapshot.trim()
  if (!nombreProd) throw new Error('Indicá el plato / vianda producida.')

  const registrarIngresoPlato = insumoProdId.length > 0

  const loteProd = input.loteProductoTerminado.trim()
  if (!loteProd) throw new Error('Indicá el lote de producción del plato terminado.')

  const fechaVto = input.fechaVencimientoProducto.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVto)) {
    throw new Error('Indicá una fecha de vencimiento válida (AAAA-MM-DD).')
  }

  const codigoTrazabilidad = input.codigoTrazabilidad.trim()
  if (!codigoTrazabilidad) throw new Error('Código de trazabilidad inválido.')
  const codigoUpper = codigoTrazabilidad.toUpperCase()
  if (!codigoUpper.startsWith('V-') && !codigoUpper.startsWith('G-')) {
    throw new Error(
      'El código de trazabilidad debe usar el formato V-… (vianda) o G-… (granel).',
    )
  }

  const menuItemId = input.menuItemId?.trim() || null
  const guarnicionMenuItemId = input.guarnicionMenuItemId?.trim() || null
  const nombreGuarnicion = input.nombreGuarnicion?.trim() || ''
  const itemsDetalle = input.itemsDetalle ?? []

  if (
    menuItemId &&
    guarnicionMenuItemId &&
    menuItemId === guarnicionMenuItemId
  ) {
    throw new Error('El plato principal y la guarnición deben ser ítems distintos.')
  }

  const payloadProduccionDoc = {
    loteProducto: loteProd,
    fechaVencimiento: fechaVto,
    codigoTrazabilidad,
    menuItemId,
    itemsDetalle,
    ...(nombreGuarnicion ? { nombreGuarnicion } : {}),
    ...(guarnicionMenuItemId ? { guarnicionMenuItemId } : {}),
  }

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

  const produccionOffline =
    typeof navigator !== 'undefined' && !navigator.onLine

  if (produccionOffline) {
    const itemsEgreso = await congelarCostoPorUnidadBaseConLecturas(
      (ref) => getDoc(ref),
      db,
      baseEgreso,
    )
    const agg = agregarItemsEgresoPorSaldo(db, ub, itemsEgreso)
    const filas = [...agg.values()]
    const snaps = await Promise.all(filas.map((row) => getDoc(row.ref)))

    for (let i = 0; i < filas.length; i++) {
      const row = filas[i]
      const snap = snaps[i]
      const disponible = snap.exists()
        ? clampNonNegative(Number(snap.data()?.cantidad ?? 0))
        : 0
      if (disponible + 1e-9 < row.cantidad) {
        throw new Error(
          `Stock insuficiente o sin datos locales para «${row.nombreSnapshot}» (lote ${row.loteLabel}). Disponible en caché: ${disponible.toLocaleString('es-AR', { maximumFractionDigits: 4 })}, solicitado: ${row.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.`,
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

    const insumoProdSnap = registrarIngresoPlato
      ? await getDoc(doc(db, COLLECTION_INSUMOS, insumoProdId))
      : null
    if (registrarIngresoPlato && !insumoProdSnap?.exists()) {
      throw new Error(
        'Sin conexión: el insumo de producto terminado no está en la caché local. Conectate una vez antes de registrar producción offline.',
      )
    }
    let itemsIngreso: ItemMovimientoInventario[] = []
    if (registrarIngresoPlato && insumoProdSnap?.exists()) {
      const insRaw = insumoProdSnap.data() as Record<string, unknown>
      const costoUnitProd = clampNonNegative(Number(insRaw.costoPorUnidadBase))
      const itemProducto: ItemMovimientoInventario = {
        insumoId: insumoProdId,
        nombreSnapshot: nombreProd,
        cantidad: nPorciones,
        lote: loteProd,
        fechaVencimiento: fechaVto,
        controlCalidadOk: true,
        costoPorUnidadBaseSnapshot: costoUnitProd,
      }
      itemsIngreso = normalizarItems([itemProducto], 'INGRESO')
      if (itemsIngreso.length === 0) {
        throw new Error('No se pudo normalizar el ingreso de producto terminado.')
      }
    }

    const batchProd = writeBatch(db)
    batchProd.set(egresoRef, {
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
      batchProd.set(
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

    if (registrarIngresoPlato && itemsIngreso.length > 0) {
      batchProd.set(ingresoRef, {
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
        batchProd.set(
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
    }

    batchProd.set(prodRef, {
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
      ingresoId: registrarIngresoPlato ? ingresoRef.id : '',
      ...payloadProduccionDoc,
      creadoEn: serverTimestamp(),
    })

    if (menuItemId) {
      const menuRef = doc(db, 'menu', menuItemId)
      const menuSnap = await getDoc(menuRef)
      if (menuSnap.exists()) {
        const merged = aplicarStockMenuProduccionEnData(
          menuSnap.data() as Record<string, unknown>,
          {
            lote: loteProd,
            fechaVencimiento: fechaVto,
            cantidad: nPorciones,
            produccionId: prodRef.id,
            codigoTrazabilidad,
            ...(nombreGuarnicion ? { nombreGuarnicion } : {}),
          },
        )
        batchProd.update(menuRef, {
          stock: merged.stock,
          stockLotes: merged.stockLotes,
        })
      }
    }

    // Combo vianda: el stock queda en el principal; la guarnición va en el nombre del lote.
    // (No se duplica stock en la guarnición: la vianda es un solo plato.)

    await batchProd.commit()
    return {
      egresoId: egresoRef.id,
      ingresoId: registrarIngresoPlato ? ingresoRef.id : '',
      registroId: prodRef.id,
    }
  }

  await runTransaction(db, async (t) => {
    const itemsEgreso = await congelarCostoPorUnidadBaseEnTransaccion(t, db, baseEgreso)
    const agg = agregarItemsEgresoPorSaldo(db, ub, itemsEgreso)
    const filas = [...agg.values()]
    const snaps = await Promise.all(filas.map((row) => t.get(row.ref)))

    const insumoProdSnap = registrarIngresoPlato
      ? await t.get(doc(db, COLLECTION_INSUMOS, insumoProdId))
      : null

    const menuRef = menuItemId ? doc(db, 'menu', menuItemId) : null
    const menuSnap = menuRef ? await t.get(menuRef) : null

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

    let itemsIngreso: ItemMovimientoInventario[] = []
    if (registrarIngresoPlato) {
      if (!insumoProdSnap?.exists()) {
        throw new Error('El insumo de producto terminado no existe en el catálogo.')
      }
      const insRaw = insumoProdSnap.data() as Record<string, unknown>
      const costoUnitProd = clampNonNegative(Number(insRaw.costoPorUnidadBase))
      const itemProducto: ItemMovimientoInventario = {
        insumoId: insumoProdId,
        nombreSnapshot: nombreProd,
        cantidad: nPorciones,
        lote: loteProd,
        fechaVencimiento: fechaVto,
        controlCalidadOk: true,
        costoPorUnidadBaseSnapshot: costoUnitProd,
      }
      itemsIngreso = normalizarItems([itemProducto], 'INGRESO')
      if (itemsIngreso.length === 0) {
        throw new Error('No se pudo normalizar el ingreso de producto terminado.')
      }
    }

    let menuUpdate: { stock: number; stockLotes: unknown } | null = null
    if (menuItemId && menuSnap?.exists()) {
      menuUpdate = aplicarStockMenuProduccionEnData(
        menuSnap.data() as Record<string, unknown>,
        {
          lote: loteProd,
          fechaVencimiento: fechaVto,
          cantidad: nPorciones,
          produccionId: prodRef.id,
          codigoTrazabilidad,
          ...(nombreGuarnicion ? { nombreGuarnicion } : {}),
        },
      )
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

    if (registrarIngresoPlato && itemsIngreso.length > 0) {
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
      ingresoId: registrarIngresoPlato ? ingresoRef.id : '',
      ...payloadProduccionDoc,
      creadoEn: serverTimestamp(),
    })

    if (menuUpdate && menuRef) {
      t.update(menuRef, {
        stock: menuUpdate.stock,
        stockLotes: menuUpdate.stockLotes,
      })
    }
  })

  return {
    egresoId: egresoRef.id,
    ingresoId: registrarIngresoPlato ? ingresoRef.id : '',
    registroId: prodRef.id,
  }
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
