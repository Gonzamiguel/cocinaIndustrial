import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase/firestore'
import { COLLECTION_INSUMOS, computeCostoPorUnidadBase } from './insumos'
import { getDb } from './firebase'
import {
  COLLECTION_MOVIMIENTOS_INVENTARIO,
  normalizarItemsMovimientoInventario,
  normalizarLoteKey,
  refSaldoLoteInventario,
  serializarItemMovimientoInventario,
  type ItemMovimientoInventario,
  type RecepcionLineaOrdenCompra,
} from './movimientosInventario'
import type {
  CambioEstadoOrdenCompra,
  EstadoLineaOrdenCompra,
  EstadoOrdenCompra,
  LineaRecepcionOcInput,
  MonedaCompra,
  OrdenCompraDoc,
  OrdenCompraLinea,
  RegistrarRecepcionOcEnIngresoInput,
  ResultadoRecepcionOcEnIngreso,
} from '../types/compras'

export const COL_ORDENES_COMPRA = 'ordenes_compra'
export const COL_CONTADORES = 'contadores'
export const CONTADOR_NUMERACION_OC = 'numeracion_oc'
export const COL_PADRON_EMPRESAS = 'padron_empresas'
export const COL_SOLICITUDES_MERCADERIA = 'solicitudes_mercaderia'

const ESTADOS_OC_RECEPCION: EstadoOrdenCompra[] = ['APROBADA', 'RECIBIDA_PARCIAL']
const ESTADOS_APROBABLES: EstadoOrdenCompra[] = ['PENDIENTE_APROBACION']
const QTY_PRECISION = 1e6

export class OrdenCompraError extends Error {
  readonly code:
    | 'NOT_FOUND'
    | 'ESTADO_INVALIDO'
    | 'SIN_ITEMS'
    | 'PROVEEDOR_INACTIVO'
    | 'LINEA_INVALIDA'
    | 'SOBRE_RECEPCION'
    | 'DATOS_INVALIDOS'

  constructor(
    message: string,
    code:
      | 'NOT_FOUND'
      | 'ESTADO_INVALIDO'
      | 'SIN_ITEMS'
      | 'PROVEEDOR_INACTIVO'
      | 'LINEA_INVALIDA'
      | 'SOBRE_RECEPCION'
      | 'DATOS_INVALIDOS',
  ) {
    super(message)
    this.name = 'OrdenCompraError'
    this.code = code
  }
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function roundQty(n: number): number {
  return Math.round(n * QTY_PRECISION) / QTY_PRECISION
}

function qtyMayor(a: number, b: number): boolean {
  return roundQty(a) > roundQty(b)
}

function qtyMenorIgual(a: number, b: number): boolean {
  return roundQty(a) <= roundQty(b)
}

function parseOrdenCompraDoc(raw: Record<string, unknown>): OrdenCompraDoc {
  return raw as unknown as OrdenCompraDoc
}

/** Firestore rechaza `undefined` en arrays/objetos anidados al hacer update. */
function serializarLineaOcParaFirestore(linea: OrdenCompraLinea): Record<string, unknown> {
  const out: Record<string, unknown> = {
    lineaId: linea.lineaId,
    insumoId: linea.insumoId,
    nombreSnapshot: linea.nombreSnapshot,
    unidadBase: linea.unidadBase,
    cantidadSolicitada: linea.cantidadSolicitada,
    precioUnitario: linea.precioUnitario,
    descuentoPorcentaje: linea.descuentoPorcentaje,
    subtotalLinea: linea.subtotalLinea,
    cantidadRecibida: linea.cantidadRecibida,
    cantidadPendiente: linea.cantidadPendiente,
    estadoLinea: linea.estadoLinea,
    movimientosIngresoIds: linea.movimientosIngresoIds ?? [],
  }
  const presentacion = linea.presentacion?.trim()
  if (presentacion) out.presentacion = presentacion
  if (
    linea.factorPresentacion != null &&
    Number.isFinite(linea.factorPresentacion) &&
    linea.factorPresentacion > 0
  ) {
    out.factorPresentacion = linea.factorPresentacion
  }
  return out
}

function serializarCambioEstadoOcParaFirestore(
  cambio: CambioEstadoOrdenCompra,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    estadoAnterior: cambio.estadoAnterior,
    estadoNuevo: cambio.estadoNuevo,
    fecha: cambio.fecha,
    usuarioUid: cambio.usuarioUid,
    usuarioNombre: cambio.usuarioNombre,
  }
  const comentario = cambio.comentario?.trim()
  if (comentario) out.comentario = comentario
  return out
}

function serializarLineasOcParaFirestore(items: OrdenCompraLinea[]): Record<string, unknown>[] {
  return items.map(serializarLineaOcParaFirestore)
}

function serializarHistorialOcParaFirestore(
  historial: CambioEstadoOrdenCompra[],
): Record<string, unknown>[] {
  return historial.map(serializarCambioEstadoOcParaFirestore)
}

function recalcularEstadoLinea(
  cantidadSolicitada: number,
  cantidadRecibida: number,
  estadoLineaActual: EstadoLineaOrdenCompra,
): Pick<OrdenCompraLinea, 'cantidadPendiente' | 'estadoLinea'> {
  if (estadoLineaActual === 'CANCELADA') {
    return { cantidadPendiente: 0, estadoLinea: 'CANCELADA' }
  }
  const pendiente = roundQty(Math.max(0, cantidadSolicitada - cantidadRecibida))
  let estadoLinea: EstadoLineaOrdenCompra = 'PENDIENTE'
  if (qtyMenorIgual(pendiente, 0) && cantidadRecibida > 0) {
    estadoLinea = 'COMPLETA'
  } else if (cantidadRecibida > 0) {
    estadoLinea = 'PARCIAL'
  }
  return { cantidadPendiente: pendiente, estadoLinea }
}

function evaluarEstadoOrdenCompra(
  items: OrdenCompraLinea[],
): { estado: EstadoOrdenCompra; recepcionCompleta: boolean } {
  const lineasActivas = items.filter((it) => it.estadoLinea !== 'CANCELADA')
  if (lineasActivas.length === 0) {
    return { estado: 'COMPLETADA', recepcionCompleta: true }
  }
  const todasCompletas = lineasActivas.every((it) => it.estadoLinea === 'COMPLETA')
  if (todasCompletas) {
    return { estado: 'COMPLETADA', recepcionCompleta: true }
  }
  const algunaRecibida = lineasActivas.some((it) => it.cantidadRecibida > 0)
  if (algunaRecibida) {
    return { estado: 'RECIBIDA_PARCIAL', recepcionCompleta: false }
  }
  return { estado: 'APROBADA', recepcionCompleta: false }
}

function recalcularLineasParaAprobacion(items: OrdenCompraLinea[]): OrdenCompraLinea[] {
  return items.map((it) => {
    const { cantidadPendiente, estadoLinea } = recalcularEstadoLinea(
      it.cantidadSolicitada,
      it.cantidadRecibida,
      it.estadoLinea,
    )
    return { ...it, cantidadPendiente, estadoLinea }
  })
}

function calcularTotales(items: OrdenCompraLinea[], alicuotaIva = 21) {
  const subtotalNeto = items.reduce((acc, it) => acc + it.subtotalLinea, 0)
  const montoIva = Math.round(subtotalNeto * (alicuotaIva / 100) * 100) / 100
  const total = Math.round((subtotalNeto + montoIva) * 100) / 100
  return { subtotalNeto, montoIva, montoPercepciones: 0, total }
}

function formatearNumeroOc(anio: number, secuencial: number): string {
  return `OC-${anio}-${String(secuencial).padStart(6, '0')}`
}

function validarFechaYmd(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())
}

function reservarNumeroOrdenCompra(
  tx: Transaction,
  contadorSnap: DocumentSnapshot,
  ahora: Date,
): { numero: string; anio: number; secuencial: number } {
  const anioActual = ahora.getFullYear()
  const contadorRef = doc(getDb(), COL_CONTADORES, CONTADOR_NUMERACION_OC)

  let secuencial = 1
  if (contadorSnap.exists()) {
    const data = contadorSnap.data() as Record<string, unknown>
    const anioGuardado = Number(data.anio)
    const ultimo = Number(data.ultimoSecuencial)
    if (anioGuardado === anioActual && Number.isFinite(ultimo) && ultimo >= 0) {
      secuencial = ultimo + 1
    }
  }

  tx.set(
    contadorRef,
    {
      anio: anioActual,
      ultimoSecuencial: secuencial,
      actualizadoEn: serverTimestamp(),
    },
    { merge: true },
  )

  return { anio: anioActual, secuencial, numero: formatearNumeroOc(anioActual, secuencial) }
}

function generarLineaId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `linea-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type CrearOrdenCompraLineaInput = {
  insumoId: string
  cantidadSolicitada: number
  precioUnitario: number
  descuentoPorcentaje?: number
}

export type CrearOrdenCompraInput = {
  proveedorId: string
  ubicacionDestinoId: string
  /** YYYY-MM-DD */
  fechaEntregaEstimada: string
  moneda?: MonedaCompra
  plazoPagoDias?: number
  condicionPago?: string
  observaciones?: string
  /** Vínculo opcional con requisición interna del depósito/cocina. */
  solicitudMercaderiaId?: string
  lineas: CrearOrdenCompraLineaInput[]
  usuarioUid: string
  usuarioNombre: string
}

export type EnviarOrdenCompraAprobacionInput = {
  ordenCompraId: string
  usuarioUid: string
  usuarioNombre: string
  comentario?: string
}

/**
 * Alta de OC emitida directamente en estado APROBADA (numeración transaccional OC-AAAA-NNNNNN).
 * Finanzas es autoridad de compra: la OC queda lista para recepción en depósito.
 */
export async function crearOrdenCompra(
  input: CrearOrdenCompraInput,
  db: Firestore = getDb(),
): Promise<{ ordenCompraId: string; numero: string }> {
  const proveedorId = input.proveedorId.trim()
  const ubicacionDestinoId = input.ubicacionDestinoId.trim().toUpperCase()
  const fechaEntregaEstimada = input.fechaEntregaEstimada.trim()

  if (!proveedorId) {
    throw new OrdenCompraError('Indicá el proveedor.', 'DATOS_INVALIDOS')
  }
  if (!ubicacionDestinoId) {
    throw new OrdenCompraError('Indicá la ubicación destino.', 'DATOS_INVALIDOS')
  }
  if (!validarFechaYmd(fechaEntregaEstimada)) {
    throw new OrdenCompraError('Fecha de entrega estimada inválida.', 'DATOS_INVALIDOS')
  }
  if (!input.lineas.length) {
    throw new OrdenCompraError('Agregá al menos un ítem a la orden.', 'SIN_ITEMS')
  }

  const provRef = doc(db, COL_PADRON_EMPRESAS, proveedorId)
  const contadorRef = doc(db, COL_CONTADORES, CONTADOR_NUMERACION_OC)
  const ocRef = doc(collection(db, COL_ORDENES_COMPRA))
  const ahora = new Date()
  const moneda = input.moneda ?? 'ARS'
  const plazoPagoDias = input.plazoPagoDias ?? 30
  const condicionPago = input.condicionPago?.trim() || `${plazoPagoDias} días`
  const solicitudId = input.solicitudMercaderiaId?.trim() || ''

  return runTransaction(db, async (tx) => {
    const solicitudRef = solicitudId
      ? doc(db, COL_SOLICITUDES_MERCADERIA, solicitudId)
      : null

    const [provSnap, contadorSnap, solSnap] = await Promise.all([
      tx.get(provRef),
      tx.get(contadorRef),
      solicitudRef ? tx.get(solicitudRef) : Promise.resolve(null),
    ])

    if (solicitudRef && solicitudId) {
      if (!solSnap?.exists()) {
        throw new OrdenCompraError('Requisición interna no encontrada.', 'NOT_FOUND')
      }
      const sol = solSnap.data() as Record<string, unknown>
      if (sol.tipoSolicitud !== 'REQUISICION_COMPRA') {
        throw new OrdenCompraError('La solicitud no es una requisición de compra.', 'ESTADO_INVALIDO')
      }
      if (sol.estado !== 'Pendiente') {
        throw new OrdenCompraError(
          `La requisición debe estar Pendiente (actual: "${String(sol.estado)}").`,
          'ESTADO_INVALIDO',
        )
      }
      if (typeof sol.ordenCompraId === 'string' && sol.ordenCompraId.trim()) {
        throw new OrdenCompraError('La requisición ya tiene una OC vinculada.', 'ESTADO_INVALIDO')
      }
    }

    if (!provSnap.exists()) {
      throw new OrdenCompraError('Proveedor no encontrado.', 'PROVEEDOR_INACTIVO')
    }
    const prov = provSnap.data() as Record<string, unknown>
    const proveedorNombre =
      typeof prov.nombre === 'string' ? prov.nombre.trim().toUpperCase() : ''
    const proveedorCuit = typeof prov.cuit === 'string' ? prov.cuit.trim() : ''
    if (!proveedorNombre) {
      throw new OrdenCompraError('El proveedor no tiene nombre válido.', 'PROVEEDOR_INACTIVO')
    }
    const roles = (prov.roles as string[] | undefined) ?? ['CONTRATISTA']
    if (!roles.includes('PROVEEDOR') || prov.proveedorActivo !== true) {
      throw new OrdenCompraError('El proveedor no está activo.', 'PROVEEDOR_INACTIVO')
    }

    const insumoIds = [...new Set(input.lineas.map((l) => l.insumoId.trim()).filter(Boolean))]
    const insumoSnaps = await Promise.all(
      insumoIds.map((id) => tx.get(doc(db, COLLECTION_INSUMOS, id))),
    )
    const insumoPorId = new Map<string, Record<string, unknown>>()
    insumoIds.forEach((id, i) => {
      const snap = insumoSnaps[i]
      if (snap?.exists()) insumoPorId.set(id, snap.data() as Record<string, unknown>)
    })

    const items: OrdenCompraLinea[] = []
    for (const linea of input.lineas) {
      const insumoId = linea.insumoId.trim()
      const cantidadSolicitada = roundQty(Number(linea.cantidadSolicitada))
      const precioUnitario = Math.round(Number(linea.precioUnitario) * 100) / 100
      const descuentoPorcentaje = clampNonNegative(Number(linea.descuentoPorcentaje ?? 0))

      if (!insumoId || !Number.isFinite(cantidadSolicitada) || cantidadSolicitada <= 0) {
        throw new OrdenCompraError('Cada ítem requiere insumo y cantidad > 0.', 'LINEA_INVALIDA')
      }
      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        throw new OrdenCompraError('Precio unitario inválido en un ítem.', 'LINEA_INVALIDA')
      }

      const rawInsumo = insumoPorId.get(insumoId)
      if (!rawInsumo) {
        throw new OrdenCompraError(`Insumo ${insumoId} no encontrado.`, 'LINEA_INVALIDA')
      }

      const nombreGenerico = String(rawInsumo.nombreGenerico ?? '').trim()
      const marca = String(rawInsumo.marca ?? '').trim()
      const presentacion = String(rawInsumo.presentacion ?? '').trim()
      const nombreSnapshot = marca
        ? `${nombreGenerico} - ${marca}${presentacion ? ` (${presentacion})` : ''}`
        : `${nombreGenerico}${presentacion ? ` (${presentacion})` : ''}`

      const unidadBase = rawInsumo.unidadBase
      if (unidadBase !== 'Kg' && unidadBase !== 'Lt' && unidadBase !== 'Un') {
        throw new OrdenCompraError(`Unidad base inválida para insumo ${insumoId}.`, 'LINEA_INVALIDA')
      }

      const bruto = cantidadSolicitada * precioUnitario
      const subtotalLinea =
        Math.round(bruto * (1 - Math.min(descuentoPorcentaje, 100) / 100) * 100) / 100

      items.push({
        lineaId: generarLineaId(),
        insumoId,
        nombreSnapshot: nombreSnapshot || insumoId,
        unidadBase,
        ...(presentacion ? { presentacion } : {}),
        cantidadSolicitada,
        precioUnitario,
        descuentoPorcentaje,
        subtotalLinea,
        cantidadRecibida: 0,
        cantidadPendiente: cantidadSolicitada,
        estadoLinea: 'PENDIENTE',
        movimientosIngresoIds: [],
      })
    }

    const itemsNormalizados = recalcularLineasParaAprobacion(items)
    const totales = calcularTotales(itemsNormalizados)
    const numeracion = reservarNumeroOrdenCompra(tx, contadorSnap, ahora)

    const historialInicial: CambioEstadoOrdenCompra = {
      estadoAnterior: null,
      estadoNuevo: 'APROBADA',
      fecha: Timestamp.fromDate(ahora),
      usuarioUid: input.usuarioUid,
      usuarioNombre: input.usuarioNombre,
      comentario: 'Emisión de orden de compra',
    }

    const docData: Omit<OrdenCompraDoc, 'creadoEn' | 'actualizadoEn'> & {
      creadoEn: ReturnType<typeof serverTimestamp>
      actualizadoEn: ReturnType<typeof serverTimestamp>
    } = {
      numero: numeracion.numero,
      anio: numeracion.anio,
      secuencial: numeracion.secuencial,
      estado: 'APROBADA',
      proveedorId,
      proveedorNombre,
      proveedorCuit,
      ubicacionDestinoId,
      fechaEmision: Timestamp.fromDate(ahora),
      fechaEntregaEstimada,
      moneda,
      plazoPagoDias,
      condicionPago,
      ...totales,
      items: itemsNormalizados,
      historialEstados: [historialInicial],
      creadoPorUid: input.usuarioUid,
      creadoPorNombre: input.usuarioNombre,
      aprobadoPorUid: input.usuarioUid,
      aprobadoPorNombre: input.usuarioNombre,
      aprobadoEn: Timestamp.fromDate(ahora),
      movimientosIngresoIds: [],
      recepcionCompleta: false,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
      ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
      ...(solicitudId ? { solicitudMercaderiaId: solicitudId } : {}),
    }

    tx.set(ocRef, {
      ...docData,
      items: serializarLineasOcParaFirestore(itemsNormalizados),
      historialEstados: serializarHistorialOcParaFirestore([historialInicial]),
    })

    if (solicitudRef && solicitudId) {
      tx.update(solicitudRef, {
        estado: 'En Compras',
        ordenCompraId: ocRef.id,
        ordenCompraNumero: numeracion.numero,
        actualizadoEn: serverTimestamp(),
      })
    }

    return { ordenCompraId: ocRef.id, numero: numeracion.numero }
  })
}

/**
 * Comprador (gerencia) envía borrador a bandeja de aprobación (BORRADOR → PENDIENTE_APROBACION).
 */
export async function enviarOrdenCompraAprobacion(
  input: EnviarOrdenCompraAprobacionInput,
  db: Firestore = getDb(),
): Promise<void> {
  const ocRef = doc(db, COL_ORDENES_COMPRA, input.ordenCompraId.trim())

  await runTransaction(db, async (tx) => {
    const ocSnap = await tx.get(ocRef)
    if (!ocSnap.exists()) {
      throw new OrdenCompraError('Orden de compra no encontrada.', 'NOT_FOUND')
    }

    const raw = parseOrdenCompraDoc(ocSnap.data() as Record<string, unknown>)
    if (raw.estado !== 'BORRADOR') {
      throw new OrdenCompraError(
        `Solo se pueden enviar borradores (estado actual: "${raw.estado}").`,
        'ESTADO_INVALIDO',
      )
    }

    const items = (raw.items ?? []) as OrdenCompraLinea[]
    if (items.length === 0) {
      throw new OrdenCompraError('La OC no tiene ítems.', 'SIN_ITEMS')
    }

    const cambio: CambioEstadoOrdenCompra = {
      estadoAnterior: 'BORRADOR',
      estadoNuevo: 'PENDIENTE_APROBACION',
      fecha: Timestamp.now(),
      usuarioUid: input.usuarioUid,
      usuarioNombre: input.usuarioNombre,
      comentario: input.comentario?.trim() || 'Enviada a aprobación de gerencia',
    }

    tx.update(ocRef, {
      estado: 'PENDIENTE_APROBACION',
      historialEstados: serializarHistorialOcParaFirestore([
        ...(raw.historialEstados ?? []),
        cambio,
      ]),
      enviadoAprobacionEn: serverTimestamp(),
      enviadoAprobacionPorUid: input.usuarioUid,
      actualizadoEn: serverTimestamp(),
    })
  })
}

type LineaRecepcionAgregada = {
  lineaId: string
  insumoId: string
  cantidadTotal: number
  filas: LineaRecepcionOcInput[]
}

function agregarLineasRecepcion(lineas: LineaRecepcionOcInput[]): LineaRecepcionAgregada[] {
  const map = new Map<string, LineaRecepcionAgregada>()
  for (const fila of lineas) {
    const lineaId = fila.lineaId.trim()
    const insumoId = fila.insumoId.trim()
    const cantidadRecibida = roundQty(Number(fila.cantidadRecibida))
    if (!lineaId || !insumoId || !Number.isFinite(cantidadRecibida) || cantidadRecibida <= 0) {
      throw new OrdenCompraError(
        'Cada línea de recepción requiere lineaId, insumoId y cantidadRecibida > 0.',
        'LINEA_INVALIDA',
      )
    }
    const key = lineaId
    const prev = map.get(key)
    if (prev && prev.insumoId !== insumoId) {
      throw new OrdenCompraError(
        `La línea ${lineaId} tiene insumos inconsistentes en la recepción.`,
        'LINEA_INVALIDA',
      )
    }
    if (prev) {
      prev.cantidadTotal = roundQty(prev.cantidadTotal + cantidadRecibida)
      prev.filas.push(fila)
    } else {
      map.set(key, {
        lineaId,
        insumoId,
        cantidadTotal: cantidadRecibida,
        filas: [fila],
      })
    }
  }
  return [...map.values()]
}

function construirItemsIngresoDesdeRecepcion(
  agregadas: LineaRecepcionAgregada[],
  ocItemsPorLineaId: Map<string, OrdenCompraLinea>,
): ItemMovimientoInventario[] {
  const items: ItemMovimientoInventario[] = []
  for (const agg of agregadas) {
    const ocLinea = ocItemsPorLineaId.get(agg.lineaId)
    if (!ocLinea) {
      throw new OrdenCompraError(
        `La línea ${agg.lineaId} no existe en la orden de compra.`,
        'LINEA_INVALIDA',
      )
    }
    if (ocLinea.insumoId !== agg.insumoId) {
      throw new OrdenCompraError(
        `El insumo de la línea ${agg.lineaId} no coincide con la OC.`,
        'LINEA_INVALIDA',
      )
    }
    if (ocLinea.estadoLinea === 'CANCELADA') {
      throw new OrdenCompraError(
        `La línea ${agg.lineaId} está cancelada en la OC.`,
        'LINEA_INVALIDA',
      )
    }
    const pendiente = roundQty(ocLinea.cantidadSolicitada - ocLinea.cantidadRecibida)
    if (qtyMayor(agg.cantidadTotal, pendiente)) {
      throw new OrdenCompraError(
        `La recepción de la línea ${agg.lineaId} supera la cantidad pendiente (${pendiente}).`,
        'SOBRE_RECEPCION',
      )
    }

    for (const fila of agg.filas) {
      const precio =
        fila.precioUnitarioFacturado != null &&
        Number.isFinite(fila.precioUnitarioFacturado) &&
        fila.precioUnitarioFacturado > 0
          ? fila.precioUnitarioFacturado
          : ocLinea.precioUnitario

      items.push({
        insumoId: ocLinea.insumoId,
        nombreSnapshot: ocLinea.nombreSnapshot,
        cantidad: roundQty(Number(fila.cantidadRecibida)),
        controlCalidadOk: fila.controlCalidadOk === true,
        ...(fila.lote?.trim() ? { lote: fila.lote.trim() } : {}),
        ...(fila.fechaVencimiento?.trim()
          ? { fechaVencimiento: fila.fechaVencimiento.trim() }
          : {}),
        ...(fila.temperatura?.trim() ? { temperatura: fila.temperatura.trim() } : {}),
        ...(precio > 0 ? { precioUnitarioFacturado: precio } : {}),
        ...(ocLinea.presentacion ? { presentacionUsada: ocLinea.presentacion } : {}),
        ...(ocLinea.factorPresentacion != null && ocLinea.factorPresentacion > 0
          ? { factorPresentacion: ocLinea.factorPresentacion }
          : {}),
      })
    }
  }
  return items
}

export type AprobarOrdenCompraInput = {
  ordenCompraId: string
  aprobadorUid: string
  aprobadorNombre: string
  comentario?: string
}

/**
 * Transición PENDIENTE_APROBACION → APROBADA.
 * Deja la OC lista para recepción en depósito.
 */
export async function aprobarOrdenCompra(
  input: AprobarOrdenCompraInput,
  db: Firestore = getDb(),
): Promise<void> {
  const ocRef = doc(db, COL_ORDENES_COMPRA, input.ordenCompraId)

  await runTransaction(db, async (tx) => {
    const ocSnap = await tx.get(ocRef)
    if (!ocSnap.exists()) {
      throw new OrdenCompraError('Orden de compra no encontrada.', 'NOT_FOUND')
    }

    const raw = parseOrdenCompraDoc(ocSnap.data() as Record<string, unknown>)
    if (!ESTADOS_APROBABLES.includes(raw.estado)) {
      throw new OrdenCompraError(
        `No se puede aprobar desde estado "${raw.estado}".`,
        'ESTADO_INVALIDO',
      )
    }

    const items = (raw.items ?? []) as OrdenCompraLinea[]
    if (items.length === 0) {
      throw new OrdenCompraError('La OC no tiene ítems.', 'SIN_ITEMS')
    }

    const provRef = doc(db, 'padron_empresas', raw.proveedorId)
    const provSnap = await tx.get(provRef)
    if (!provSnap.exists()) {
      throw new OrdenCompraError('Proveedor inexistente.', 'PROVEEDOR_INACTIVO')
    }
    const prov = provSnap.data() as Record<string, unknown>
    const roles = (prov.roles as string[] | undefined) ?? ['CONTRATISTA']
    if (!roles.includes('PROVEEDOR') || prov.proveedorActivo !== true) {
      throw new OrdenCompraError('El proveedor no está activo.', 'PROVEEDOR_INACTIVO')
    }

    const itemsNormalizados = recalcularLineasParaAprobacion(items)
    const totales = calcularTotales(itemsNormalizados)

    const cambio: CambioEstadoOrdenCompra = {
      estadoAnterior: raw.estado,
      estadoNuevo: 'APROBADA',
      fecha: Timestamp.now(),
      usuarioUid: input.aprobadorUid,
      usuarioNombre: input.aprobadorNombre,
      ...(input.comentario?.trim() ? { comentario: input.comentario.trim() } : {}),
    }

    tx.update(ocRef, {
      estado: 'APROBADA',
      items: serializarLineasOcParaFirestore(itemsNormalizados),
      ...totales,
      historialEstados: serializarHistorialOcParaFirestore([
        ...(raw.historialEstados ?? []),
        cambio,
      ]),
      aprobadoPorUid: input.aprobadorUid,
      aprobadoPorNombre: input.aprobadorNombre,
      aprobadoEn: serverTimestamp(),
      recepcionCompleta: false,
      actualizadoEn: serverTimestamp(),
    })
  })
}

/**
 * Puente Módulo A → Depósito: recepción física cruzada con OC en una sola transacción.
 *
 * 1. Valida OC (APROBADA | RECIBIDA_PARCIAL).
 * 2. Crea INGRESO en movimientos_inventario.
 * 3. Actualiza saldo_lotes e insumos (costo).
 * 4. Incrementa cantidadRecibida por línea de OC.
 * 5. Recalcula estado RECIBIDA_PARCIAL | COMPLETADA + historialEstados.
 */
export async function registrarRecepcionOcEnIngreso(
  input: RegistrarRecepcionOcEnIngresoInput,
  db: Firestore = getDb(),
): Promise<ResultadoRecepcionOcEnIngreso> {
  const numeroDocumento = input.numeroDocumento.trim()
  if (!numeroDocumento) {
    throw new OrdenCompraError('Indicá el número de documento de recepción.', 'DATOS_INVALIDOS')
  }
  if (input.tipoDocumento !== 'Remito' && input.tipoDocumento !== 'Factura') {
    throw new OrdenCompraError('Tipo de documento inválido.', 'DATOS_INVALIDOS')
  }
  if (!input.lineas.length) {
    throw new OrdenCompraError('Indicá al menos una línea de recepción.', 'DATOS_INVALIDOS')
  }

  const ocRef = doc(db, COL_ORDENES_COMPRA, input.ordenCompraId)
  const movRef = doc(collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO))
  const fechaTs = Timestamp.fromDate(input.fecha)

  return runTransaction(db, async (tx) => {
    const ocSnap = await tx.get(ocRef)
    if (!ocSnap.exists()) {
      throw new OrdenCompraError('Orden de compra no encontrada.', 'NOT_FOUND')
    }

    const oc = parseOrdenCompraDoc(ocSnap.data() as Record<string, unknown>)
    if (!ESTADOS_OC_RECEPCION.includes(oc.estado)) {
      throw new OrdenCompraError(
        `La OC debe estar APROBADA o RECIBIDA_PARCIAL (actual: "${oc.estado}").`,
        'ESTADO_INVALIDO',
      )
    }

    const ocItems = [...(oc.items ?? [])] as OrdenCompraLinea[]
    if (ocItems.length === 0) {
      throw new OrdenCompraError('La OC no tiene ítems.', 'SIN_ITEMS')
    }

    const ocItemsPorLineaId = new Map(ocItems.map((it) => [it.lineaId, it]))
    const agregadas = agregarLineasRecepcion(input.lineas)
    const itemsIngresoRaw = construirItemsIngresoDesdeRecepcion(agregadas, ocItemsPorLineaId)
    const itemsIngreso = normalizarItemsMovimientoInventario(itemsIngresoRaw, 'INGRESO')
    if (itemsIngreso.length === 0) {
      throw new OrdenCompraError('No hay ítems válidos para ingresar.', 'DATOS_INVALIDOS')
    }

    const ubicacionId = oc.ubicacionDestinoId.trim().toUpperCase()
    const recepcionLineas: RecepcionLineaOrdenCompra[] = agregadas.map((agg) => ({
      lineaId: agg.lineaId,
      insumoId: agg.insumoId,
      cantidadRecibida: agg.cantidadTotal,
    }))

    const precioActualizaCatalogo = new Map<string, number>()
    for (const it of itemsIngreso) {
      const p = it.precioUnitarioFacturado
      if (p != null && Number.isFinite(p) && p > 0) {
        precioActualizaCatalogo.set(it.insumoId, clampNonNegative(p))
      }
    }
    const idsCatalogo = [...precioActualizaCatalogo.keys()]
    const insumoSnaps = await Promise.all(
      idsCatalogo.map((id) => tx.get(doc(db, COLLECTION_INSUMOS, id))),
    )

    tx.set(movRef, {
      tipo: 'INGRESO' as const,
      fecha: fechaTs,
      proveedor: oc.proveedorNombre,
      tipoDocumento: input.tipoDocumento,
      numeroDocumento,
      ubicacionId,
      items: itemsIngreso.map((it) => serializarItemMovimientoInventario(it, true)),
      ordenCompraId: input.ordenCompraId,
      ordenCompraNumero: oc.numero,
      recepcionLineas,
      creadoEn: serverTimestamp(),
      ...(input.observaciones?.trim()
        ? { observacionesRecepcionOc: input.observaciones.trim() }
        : {}),
      usuarioRecepcionUid: input.usuarioUid,
      usuarioRecepcionNombre: input.usuarioNombre,
    })

    for (const it of itemsIngreso) {
      const lk = normalizarLoteKey(it.lote)
      const qty = Math.abs(Number(it.cantidad))
      if (!Number.isFinite(qty) || qty <= 0) continue
      const sref = refSaldoLoteInventario(db, ubicacionId, it.insumoId, lk)
      tx.set(
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
      const costoPorUnidadBase = computeCostoPorUnidadBase(nuevoCostoEnvase, contenidoNeto)
      tx.update(doc(db, COLLECTION_INSUMOS, insumoId), {
        costoEnvase: nuevoCostoEnvase,
        costoPorUnidadBase: clampNonNegative(costoPorUnidadBase),
        actualizadoEn: serverTimestamp(),
      })
    }

    const movimientoId = movRef.id
    const itemsActualizados = ocItems.map((linea) => {
      const agg = agregadas.find((a) => a.lineaId === linea.lineaId)
      if (!agg) return linea

      const cantidadRecibida = roundQty(linea.cantidadRecibida + agg.cantidadTotal)
      const { cantidadPendiente, estadoLinea } = recalcularEstadoLinea(
        linea.cantidadSolicitada,
        cantidadRecibida,
        linea.estadoLinea,
      )
      return {
        ...linea,
        cantidadRecibida,
        cantidadPendiente,
        estadoLinea,
        movimientosIngresoIds: [...(linea.movimientosIngresoIds ?? []), movimientoId],
      }
    })

    const estadoAnterior = oc.estado
    const { estado: estadoNuevo, recepcionCompleta } = evaluarEstadoOrdenCompra(itemsActualizados)
    const historial = [...(oc.historialEstados ?? [])]
    if (estadoNuevo !== estadoAnterior) {
      historial.push({
        estadoAnterior,
        estadoNuevo,
        fecha: Timestamp.now(),
        usuarioUid: input.usuarioUid,
        usuarioNombre: input.usuarioNombre,
        ...(input.observaciones?.trim()
          ? { comentario: input.observaciones.trim() }
          : {}),
      })
    }

    tx.update(ocRef, {
      estado: estadoNuevo,
      items: serializarLineasOcParaFirestore(itemsActualizados),
      movimientosIngresoIds: [...(oc.movimientosIngresoIds ?? []), movimientoId],
      recepcionCompleta,
      historialEstados: serializarHistorialOcParaFirestore(historial),
      actualizadoEn: serverTimestamp(),
    })

    return {
      movimientoId,
      ordenCompraEstado: estadoNuevo,
      ordenCompraNumero: oc.numero,
    }
  })
}
