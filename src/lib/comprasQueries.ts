import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COL_DOCUMENTOS_ADJUNTOS } from './documentos'
import { COL_ORDENES_COMPRA } from './ordenesCompra'
import { COLLECTION_MOVIMIENTOS_INVENTARIO } from './movimientosInventario'
import { COL_FACTURAS_PROVEEDORES, COL_ORDENES_PAGO, COL_PADRON_EMPRESAS } from './tesoreria'
import { mapProveedorPadron, type ProveedorPadron } from './proveedoresPadron'
import {
  mapFacturaProveedor,
  mapOrdenCompra,
  mapOrdenPago,
  montoFacturadoOc,
  saldoAFacturarOc,
} from './tesoreriaQueries'
import { moneyIgual, roundMoney } from './tesoreriaUi'
import type { OrdenCompra } from '../types/compras'
import type { DocumentoAdjunto, DocumentoAdjuntoDoc } from '../types/documentos'
import type { FacturaProveedor, OrdenPago } from '../types/tesoreria'

export interface RecepcionOcResumen {
  movimientoId: string
  tipoDocumento: string
  numeroDocumento: string
  fecha: Date | null
  usuarioRecepcionNombre: string
  cantidadLineas: number
  cantidadUnidades: number
}

export interface ExpedienteOcData {
  orden: OrdenCompra | null
  recepciones: RecepcionOcResumen[]
  facturas: FacturaProveedor[]
  documentos: DocumentoAdjunto[]
}

export interface MatchTresViasEstado {
  tieneRecepcion: boolean
  tieneRemitoAdjunto: boolean
  tieneFacturaRegistrada: boolean
  tieneFacturaPdf: boolean
  montosCoinciden: boolean
  expedienteCompleto: boolean
}

export interface LegajoProveedorData {
  proveedor: ProveedorPadron | null
  ordenes: OrdenCompra[]
  facturas: FacturaProveedor[]
  ordenesPago: OrdenPago[]
  documentos: DocumentoAdjunto[]
}

/** Datos sugeridos para registrar factura a partir de recepción en depósito. */
export interface PrefillFacturaOc {
  numeroFactura: string
  fechaEmision: string
  fechaVencimiento: string
  neto: string
  montoIva: string
  montoPercepciones: string
  total: string
  pdfEnExpedienteOc: boolean
  tipoComprobanteDeposito?: 'REMITO' | 'FACTURA'
  numeroComprobanteDeposito?: string
}

function tsToDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return null
}

function mapDocumentoAdjunto(id: string, data: DocumentData): DocumentoAdjunto {
  const docu = data as unknown as DocumentoAdjuntoDoc
  return { ...docu, id }
}

function mapRecepcionOc(movimientoId: string, data: DocumentData): RecepcionOcResumen | null {
  if (data.tipo !== 'INGRESO') return null
  const recepcionLineas = Array.isArray(data.recepcionLineas) ? data.recepcionLineas : []
  let cantidadUnidades = 0
  for (const row of recepcionLineas) {
    if (!row || typeof row !== 'object') continue
    const qty = Number((row as Record<string, unknown>).cantidadRecibida)
    if (Number.isFinite(qty)) cantidadUnidades += qty
  }
  const tipoDocumento =
    data.tipoDocumento === 'Factura' ? 'Factura' : 'Remito'
  return {
    movimientoId,
    tipoDocumento,
    numeroDocumento:
      typeof data.numeroDocumento === 'string' ? data.numeroDocumento.trim() : '—',
    fecha: tsToDate(data.fecha),
    usuarioRecepcionNombre:
      typeof data.usuarioRecepcionNombre === 'string' &&
      data.usuarioRecepcionNombre.trim()
        ? data.usuarioRecepcionNombre.trim()
        : '—',
    cantidadLineas: recepcionLineas.length,
    cantidadUnidades: Math.round(cantidadUnidades * 1000) / 1000,
  }
}

function mergeDocumentosUnicos(listas: DocumentoAdjunto[][]): DocumentoAdjunto[] {
  const map = new Map<string, DocumentoAdjunto>()
  for (const lista of listas) {
    for (const docu of lista) {
      map.set(docu.id, docu)
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      (tsToDate(b.fechaSubida)?.getTime() ?? 0) -
      (tsToDate(a.fechaSubida)?.getTime() ?? 0),
  )
}

function ymdFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, da] = ymd.split('-').map(Number)
  if (!y || !mo || !da) return ymd
  const d = new Date(y, mo - 1, da + days, 12, 0, 0, 0)
  return ymdFromDate(d)
}

/** Indica si depósito ya adjuntó remito o factura escaneada en el expediente de la OC. */
export function ocTieneComprobanteDeposito(documentos: DocumentoAdjunto[]): boolean {
  return documentos.some(
    (d) =>
      d.entidadTipo === 'ORDEN_COMPRA' &&
      (d.tipoComprobante === 'REMITO' || d.tipoComprobante === 'FACTURA'),
  )
}

/**
 * Arma valores sugeridos para el alta de factura fiscal a partir de la recepción en depósito.
 */
export async function cargarPrefillFacturaOc(
  ordenCompraId: string,
  db = getDb(),
): Promise<PrefillFacturaOc | null> {
  const expediente = await cargarExpedienteOc(ordenCompraId, db)
  const { orden, recepciones, documentos } = expediente
  if (!orden) return null

  const saldo = saldoAFacturarOc(orden)
  const ratio = orden.total > 0 ? saldo / orden.total : 1
  const neto = roundMoney(orden.subtotalNeto * ratio)
  const montoIva = roundMoney(orden.montoIva * ratio)
  const montoPercepciones = roundMoney(orden.montoPercepciones * ratio)
  const total = roundMoney(saldo)

  const ultimaRecepcion = recepciones[0] ?? null
  let fechaEmision = ymdFromDate(new Date())
  if (ultimaRecepcion?.fecha) {
    fechaEmision = ymdFromDate(ultimaRecepcion.fecha)
  }

  const plazo = orden.plazoPagoDias ?? 30
  const fechaVencimiento = addDaysYmd(fechaEmision, plazo)

  let numeroFactura = ''
  const numDoc = ultimaRecepcion?.numeroDocumento?.trim()
  if (numDoc && numDoc !== '—') {
    numeroFactura = numDoc
  }

  const docFactura = documentos.find((d) => d.tipoComprobante === 'FACTURA')
  const docRemito = documentos.find((d) => d.tipoComprobante === 'REMITO')
  const pdfEnExpedienteOc = !!(docFactura || docRemito)

  return {
    numeroFactura,
    fechaEmision,
    fechaVencimiento,
    neto: neto > 0 ? String(neto) : '',
    montoIva: montoIva > 0 ? String(montoIva) : '',
    montoPercepciones: montoPercepciones > 0 ? String(montoPercepciones) : '',
    total: total > 0 ? String(total) : '',
    pdfEnExpedienteOc,
    tipoComprobanteDeposito: docFactura ? 'FACTURA' : docRemito ? 'REMITO' : undefined,
    numeroComprobanteDeposito: numDoc && numDoc !== '—' ? numDoc : undefined,
  }
}

/** Evalúa el match OC + remito + factura para auditoría y pago. */
export function evaluarMatchTresVias(input: {
  orden: OrdenCompra
  recepciones: RecepcionOcResumen[]
  facturas: FacturaProveedor[]
  documentos: DocumentoAdjunto[]
}): MatchTresViasEstado {
  const { orden, recepciones, facturas, documentos } = input
  const lineasActivas = orden.items.filter((it) => it.estadoLinea !== 'CANCELADA')
  const solicitado = lineasActivas.reduce((acc, it) => acc + it.cantidadSolicitada, 0)
  const recibido = lineasActivas.reduce((acc, it) => acc + it.cantidadRecibida, 0)
  const tieneRecepcion =
    recepciones.length > 0 || (solicitado > 0 && recibido > 0)
  const tieneRemitoAdjunto = documentos.some((d) => d.tipoComprobante === 'REMITO')
  const facturasActivas = facturas.filter((f) => f.estado !== 'ANULADA')
  const tieneFacturaRegistrada = facturasActivas.length > 0
  const tieneFacturaPdf = documentos.some((d) => d.tipoComprobante === 'FACTURA')
  const montosCoinciden =
    moneyIgual(montoFacturadoOc(orden), orden.total) || saldoAFacturarOc(orden) <= 0.02

  return {
    tieneRecepcion,
    tieneRemitoAdjunto,
    tieneFacturaRegistrada,
    tieneFacturaPdf,
    montosCoinciden,
    expedienteCompleto:
      tieneRecepcion &&
      tieneRemitoAdjunto &&
      tieneFacturaRegistrada &&
      tieneFacturaPdf &&
      montosCoinciden,
  }
}

/**
 * Carga en paralelo la OC, recepciones vinculadas, facturas y documentos del expediente.
 */
export async function cargarExpedienteOc(
  ordenCompraId: string,
  db = getDb(),
): Promise<ExpedienteOcData> {
  const ocId = ordenCompraId.trim()
  if (!ocId) {
    return { orden: null, recepciones: [], facturas: [], documentos: [] }
  }

  const ocRef = doc(db, COL_ORDENES_COMPRA, ocId)
  const recepcionesQ = query(
    collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO),
    where('ordenCompraId', '==', ocId),
  )
  const facturasQ = query(
    collection(db, COL_FACTURAS_PROVEEDORES),
    where('ordenCompraId', '==', ocId),
  )
  const documentosEntidadQ = query(
    collection(db, COL_DOCUMENTOS_ADJUNTOS),
    where('entidadId', '==', ocId),
    where('entidadTipo', '==', 'ORDEN_COMPRA'),
  )
  const documentosPorOcQ = query(
    collection(db, COL_DOCUMENTOS_ADJUNTOS),
    where('ordenCompraId', '==', ocId),
  )

  const [ocSnap, recepSnap, factSnap, docsEntidadSnap, docsPorOcSnap] = await Promise.all([
    getDoc(ocRef),
    getDocs(recepcionesQ),
    getDocs(facturasQ),
    getDocs(documentosEntidadQ),
    getDocs(documentosPorOcQ),
  ])

  const orden = ocSnap.exists()
    ? mapOrdenCompra(ocSnap.id, ocSnap.data() as Record<string, unknown>)
    : null

  const recepciones: RecepcionOcResumen[] = []
  recepSnap.forEach((d) => {
    const row = mapRecepcionOc(d.id, d.data())
    if (row) recepciones.push(row)
  })
  recepciones.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0))

  const facturas: FacturaProveedor[] = []
  factSnap.forEach((d) => {
    facturas.push(mapFacturaProveedor(d.id, d.data() as Record<string, unknown>))
  })
  facturas.sort((a, b) => a.numeroFactura.localeCompare(b.numeroFactura, 'es'))

  const docsEntidad: DocumentoAdjunto[] = []
  docsEntidadSnap.forEach((d) => {
    docsEntidad.push(mapDocumentoAdjunto(d.id, d.data()))
  })
  const docsPorOc: DocumentoAdjunto[] = []
  docsPorOcSnap.forEach((d) => {
    docsPorOc.push(mapDocumentoAdjunto(d.id, d.data()))
  })

  const facturaDocSnaps = await Promise.all(
    facturas.map((f) =>
      getDocs(
        query(
          collection(db, COL_DOCUMENTOS_ADJUNTOS),
          where('entidadId', '==', f.id),
          where('entidadTipo', '==', 'FACTURA_PROVEEDOR'),
        ),
      ),
    ),
  )
  const docsFacturas: DocumentoAdjunto[] = []
  facturaDocSnaps.forEach((snap) => {
    snap.forEach((d) => {
      docsFacturas.push(mapDocumentoAdjunto(d.id, d.data()))
    })
  })

  const documentos = mergeDocumentosUnicos([docsEntidad, docsPorOc, docsFacturas])

  return { orden, recepciones, facturas, documentos }
}

/** Reúne comprobantes del proveedor: por proveedorId, por OC y por factura. */
async function recopilarDocumentosProveedor(
  proveedorId: string,
  ordenes: OrdenCompra[],
  facturas: FacturaProveedor[],
  db = getDb(),
): Promise<DocumentoAdjunto[]> {
  const id = proveedorId.trim()
  const ocIds = [...new Set(ordenes.map((o) => o.id))]
  const listas: DocumentoAdjunto[][] = []

  const docsProvSnap = await getDocs(
    query(collection(db, COL_DOCUMENTOS_ADJUNTOS), where('proveedorId', '==', id)),
  )
  const porProveedor: DocumentoAdjunto[] = []
  docsProvSnap.forEach((d) => porProveedor.push(mapDocumentoAdjunto(d.id, d.data())))
  listas.push(porProveedor)

  const docsEntidadProvSnap = await getDocs(
    query(
      collection(db, COL_DOCUMENTOS_ADJUNTOS),
      where('entidadId', '==', id),
      where('entidadTipo', '==', 'PROVEEDOR'),
    ),
  )
  const porEntidadProveedor: DocumentoAdjunto[] = []
  docsEntidadProvSnap.forEach((d) =>
    porEntidadProveedor.push(mapDocumentoAdjunto(d.id, d.data())),
  )
  listas.push(porEntidadProveedor)

  if (ocIds.length > 0) {
    const [porOcIdSnaps, porEntidadOcSnaps] = await Promise.all([
      Promise.all(
        ocIds.map((ocId) =>
          getDocs(
            query(
              collection(db, COL_DOCUMENTOS_ADJUNTOS),
              where('ordenCompraId', '==', ocId),
            ),
          ),
        ),
      ),
      Promise.all(
        ocIds.map((ocId) =>
          getDocs(
            query(
              collection(db, COL_DOCUMENTOS_ADJUNTOS),
              where('entidadId', '==', ocId),
              where('entidadTipo', '==', 'ORDEN_COMPRA'),
            ),
          ),
        ),
      ),
    ])
    const porOc: DocumentoAdjunto[] = []
    for (const snap of [...porOcIdSnaps, ...porEntidadOcSnaps]) {
      snap.forEach((d) => porOc.push(mapDocumentoAdjunto(d.id, d.data())))
    }
    listas.push(porOc)
  }

  if (facturas.length > 0) {
    const facturaDocSnaps = await Promise.all(
      facturas.map((f) =>
        getDocs(
          query(
            collection(db, COL_DOCUMENTOS_ADJUNTOS),
            where('entidadId', '==', f.id),
            where('entidadTipo', '==', 'FACTURA_PROVEEDOR'),
          ),
        ),
      ),
    )
    const porFactura: DocumentoAdjunto[] = []
    facturaDocSnaps.forEach((snap) => {
      snap.forEach((d) => porFactura.push(mapDocumentoAdjunto(d.id, d.data())))
    })
    listas.push(porFactura)
  }

  return mergeDocumentosUnicos(listas)
}

async function recopilarDocumentosOrdenesPago(
  ordenesPago: OrdenPago[],
  db = getDb(),
): Promise<DocumentoAdjunto[]> {
  if (ordenesPago.length === 0) return []
  const opDocSnaps = await Promise.all(
    ordenesPago.map((op) =>
      getDocs(
        query(
          collection(db, COL_DOCUMENTOS_ADJUNTOS),
          where('entidadId', '==', op.id),
          where('entidadTipo', '==', 'ORDEN_PAGO'),
        ),
      ),
    ),
  )
  const porOp: DocumentoAdjunto[] = []
  opDocSnaps.forEach((snap) => {
    snap.forEach((d) => porOp.push(mapDocumentoAdjunto(d.id, d.data())))
  })
  return porOp
}

/** Lectura puntual de una OC por id (sin recepciones/facturas). */
export async function obtenerOrdenCompraPorId(
  ordenCompraId: string,
  db = getDb(),
): Promise<OrdenCompra | null> {
  const ocId = ordenCompraId.trim()
  if (!ocId) return null
  const snap = await getDoc(doc(db, COL_ORDENES_COMPRA, ocId))
  if (!snap.exists()) return null
  return mapOrdenCompra(snap.id, snap.data() as Record<string, unknown>)
}

/** Legajo digital del proveedor: OCs, facturas y comprobantes adjuntos. */
export async function cargarLegajoProveedor(
  proveedorId: string,
  db = getDb(),
): Promise<LegajoProveedorData> {
  const id = proveedorId.trim()
  if (!id) {
    return { proveedor: null, ordenes: [], facturas: [], ordenesPago: [], documentos: [] }
  }

  const provRef = doc(db, COL_PADRON_EMPRESAS, id)
  const facturasQ = query(
    collection(db, COL_FACTURAS_PROVEEDORES),
    where('proveedorId', '==', id),
  )
  const ordenesQ = query(
    collection(db, COL_ORDENES_COMPRA),
    where('proveedorId', '==', id),
  )
  const opsQ = query(
    collection(db, COL_ORDENES_PAGO),
    where('proveedorId', '==', id),
  )

  const [provSnap, factSnap, ordenesSnap, opsSnap] = await Promise.all([
    getDoc(provRef),
    getDocs(facturasQ),
    getDocs(ordenesQ),
    getDocs(opsQ),
  ])

  const proveedor = provSnap.exists()
    ? mapProveedorPadron(provSnap.id, provSnap.data() as Record<string, unknown>)
    : null

  const facturas: FacturaProveedor[] = []
  factSnap.forEach((d) => {
    facturas.push(mapFacturaProveedor(d.id, d.data() as Record<string, unknown>))
  })
  facturas.sort((a, b) => b.fechaEmision.toMillis() - a.fechaEmision.toMillis())

  const ordenes: OrdenCompra[] = []
  ordenesSnap.forEach((d) => {
    ordenes.push(mapOrdenCompra(d.id, d.data() as Record<string, unknown>))
  })
  ordenes.sort((a, b) => b.numero.localeCompare(a.numero, 'es'))

  const ordenesPago: OrdenPago[] = []
  opsSnap.forEach((d) => {
    ordenesPago.push(mapOrdenPago(d.id, d.data() as Record<string, unknown>))
  })
  ordenesPago.sort((a, b) => b.numero.localeCompare(a.numero, 'es'))

  const docsOcFacturas = await recopilarDocumentosProveedor(id, ordenes, facturas, db)
  const docsOp = await recopilarDocumentosOrdenesPago(ordenesPago, db)
  const documentos = mergeDocumentosUnicos([docsOcFacturas, docsOp])

  return { proveedor, ordenes, facturas, ordenesPago, documentos }
}

/** Suscripción en tiempo real al expediente de una OC (incluye comprobantes de depósito). */
export function subscribeExpedienteOc(
  ordenCompraId: string,
  onChange: (data: ExpedienteOcData) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const ocId = ordenCompraId.trim()
  if (!ocId) {
    onChange({ orden: null, recepciones: [], facturas: [], documentos: [] })
    return () => undefined
  }

  let activo = true
  let recargando = false
  let pendiente = false

  async function recargar() {
    if (!activo) return
    if (recargando) {
      pendiente = true
      return
    }
    recargando = true
    try {
      const data = await cargarExpedienteOc(ocId)
      if (activo) onChange(data)
    } catch (err) {
      if (activo) {
        onError?.(err instanceof Error ? err.message : 'No se pudo actualizar el expediente.')
      }
    } finally {
      recargando = false
      if (pendiente && activo) {
        pendiente = false
        void recargar()
      }
    }
  }

  const db = getDb()
  const notificar = () => void recargar()

  const unsubs = [
    onSnapshot(doc(db, COL_ORDENES_COMPRA, ocId), notificar, (err) => onError?.(err.message)),
    onSnapshot(
      query(
        collection(db, COLLECTION_MOVIMIENTOS_INVENTARIO),
        where('ordenCompraId', '==', ocId),
      ),
      notificar,
      (err) => onError?.(err.message),
    ),
    onSnapshot(
      query(collection(db, COL_FACTURAS_PROVEEDORES), where('ordenCompraId', '==', ocId)),
      notificar,
      (err) => onError?.(err.message),
    ),
    onSnapshot(
      query(
        collection(db, COL_DOCUMENTOS_ADJUNTOS),
        where('ordenCompraId', '==', ocId),
      ),
      notificar,
      (err) => onError?.(err.message),
    ),
    onSnapshot(
      query(
        collection(db, COL_DOCUMENTOS_ADJUNTOS),
        where('entidadId', '==', ocId),
        where('entidadTipo', '==', 'ORDEN_COMPRA'),
      ),
      notificar,
      (err) => onError?.(err.message),
    ),
  ]

  void recargar()

  return () => {
    activo = false
    unsubs.forEach((u) => u())
  }
}

/**
 * Suscripción en tiempo real al legajo (OC, facturas y comprobantes).
 * Se actualiza cuando depósito sube remitos o finanzas adjunta facturas.
 */
export function subscribeLegajoProveedor(
  proveedorId: string,
  onChange: (data: LegajoProveedorData) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const id = proveedorId.trim()
  if (!id) {
    onChange({ proveedor: null, ordenes: [], facturas: [], ordenesPago: [], documentos: [] })
    return () => undefined
  }

  let activo = true
  let recargando = false
  let pendiente = false

  async function recargar() {
    if (!activo) return
    if (recargando) {
      pendiente = true
      return
    }
    recargando = true
    try {
      const data = await cargarLegajoProveedor(id)
      if (activo) onChange(data)
    } catch (err) {
      if (activo) {
        onError?.(err instanceof Error ? err.message : 'No se pudo actualizar el legajo.')
      }
    } finally {
      recargando = false
      if (pendiente && activo) {
        pendiente = false
        void recargar()
      }
    }
  }

  const db = getDb()
  const notificar = () => void recargar()

  const unsubs = [
    onSnapshot(
      query(collection(db, COL_ORDENES_COMPRA), where('proveedorId', '==', id)),
      notificar,
      (err) => onError?.(err.message),
    ),
    onSnapshot(
      query(collection(db, COL_FACTURAS_PROVEEDORES), where('proveedorId', '==', id)),
      notificar,
      (err) => onError?.(err.message),
    ),
    onSnapshot(
      query(collection(db, COL_DOCUMENTOS_ADJUNTOS), where('proveedorId', '==', id)),
      notificar,
      (err) => onError?.(err.message),
    ),
  ]

  void recargar()

  return () => {
    activo = false
    unsubs.forEach((u) => u())
  }
}
