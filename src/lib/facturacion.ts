import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import { esRegistroVianda } from './dashboardFacturacion'
import { COL_REGISTROS_COMEDOR, mapRegistroComedor } from './comedor'
import { COL_HISTORIAL_PERNOCTES, mapHistorial } from './hoteleria'
import { nochesEnRango } from './hoteleriaPernoctes'
import { COL_PADRON_EMPRESAS, normalizarNombreEmpresa } from './padronEmpresas'
import {
  leerSaldoCliente,
  patchCondicionesSaldoCliente,
} from './padronSaldos'
import type { RegistroComedor } from '../types/comedor'
import type { HistorialPernocte } from '../types/hoteleria'
import type {
  AnularLiquidacionInput,
  AnularLiquidacionResult,
  ConceptoLiquidacion,
  DetalleLiquidacionContratista,
  EmitirLiquidacionInput,
  EmitirLiquidacionResult,
  LiquidacionContratista,
  ListaPreciosContratista,
  PreviewLiquidacionContratista,
} from '../types/facturacion'

export const COL_LIQUIDACIONES = 'liquidaciones_contratistas'
export const COL_CONTADORES = 'contadores'
export const CONTADOR_NUMERACION_LIQ = 'numeracion_liq'

/** Máximo de operaciones por batch (Firestore: 500; margen de seguridad). */
export const BATCH_CHUNK_SIZE = 450

export type FacturacionErrorCode =
  | 'DATOS_INVALIDOS'
  | 'EMPRESA_NO_ENCONTRADA'
  | 'SIN_CONSUMOS'
  | 'CONSUMO_YA_LIQUIDADO'
  | 'PERIODO_INVALIDO'
  | 'PERNOCTE_ABIERTO'
  | 'PERNOCTE_CRUZA_PERIODO'
  | 'NOT_FOUND'
  | 'ESTADO_INVALIDO'

export const ETIQUETAS_CONCEPTO_LIQUIDACION: Record<ConceptoLiquidacion, string> = {
  DESAYUNO: 'Desayunos',
  MERIENDA: 'Meriendas',
  VIANDA: 'Viandas',
  ALMUERZO: 'Almuerzos',
  REFRIGERIO_ALMUERZO: 'Refrigerios (almuerzo)',
  CENA: 'Cenas',
  CENA_NOCHERO: 'Cenas nocheras',
  NOCHE: 'Noches de hotelería',
}

export class FacturacionError extends Error {
  code: FacturacionErrorCode

  constructor(message: string, code: FacturacionErrorCode) {
    super(message)
    this.name = 'FacturacionError'
    this.code = code
  }
}

type ConteosConcepto = Record<ConceptoLiquidacion, number>

function conteosVacios(): ConteosConcepto {
  return {
    DESAYUNO: 0,
    MERIENDA: 0,
    VIANDA: 0,
    ALMUERZO: 0,
    REFRIGERIO_ALMUERZO: 0,
    CENA: 0,
    CENA_NOCHERO: 0,
    NOCHE: 0,
  }
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function validarRangoFechas(fechaInicio: string, fechaFin: string): void {
  const ini = fechaInicio.trim()
  const fin = fechaFin.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    throw new FacturacionError('Las fechas deben tener formato YYYY-MM-DD.', 'PERIODO_INVALIDO')
  }
  if (ini > fin) {
    throw new FacturacionError('La fecha de inicio no puede ser posterior a la de fin.', 'PERIODO_INVALIDO')
  }
}

function normEmpresa(s: string): string {
  const t = s.trim()
  return t || '—'
}

function empresasCoinciden(a: string, b: string): boolean {
  return normEmpresa(a).localeCompare(normEmpresa(b), 'es', { sensitivity: 'base' }) === 0
}

export function esConsumoLiquidable(liquidado: boolean | undefined): boolean {
  return liquidado !== true
}

function acumularRegistroComedor(conteos: ConteosConcepto, registro: RegistroComedor): void {
  switch (registro.servicio) {
    case 'DESAYUNO':
      conteos.DESAYUNO += 1
      break
    case 'MERIENDA':
      if (esRegistroVianda(registro)) conteos.VIANDA += 1
      else conteos.MERIENDA += 1
      break
    case 'ALMUERZO':
      if (registro.contieneRefrigerio === true) conteos.REFRIGERIO_ALMUERZO += 1
      else conteos.ALMUERZO += 1
      break
    case 'CENA':
      conteos.CENA += 1
      break
    case 'CENA_NOCHERO':
      conteos.CENA_NOCHERO += 1
      break
    default:
      break
  }
}

function validarPernocteParaLiquidacion(
  pernocte: HistorialPernocte,
  fechaFin: string,
): void {
  if (!pernocte.fechaCheckIn) {
    throw new FacturacionError(
      `El pernocte ${pernocte.id} no tiene fecha de check-in.`,
      'DATOS_INVALIDOS',
    )
  }
  if (!pernocte.fechaCheckOut) {
    throw new FacturacionError(
      `El pernocte ${pernocte.id} sigue abierto. Cerrá la estadía antes de liquidar.`,
      'PERNOCTE_ABIERTO',
    )
  }
  const checkoutYmd = ymdLocal(pernocte.fechaCheckOut)
  if (checkoutYmd > fechaFin) {
    throw new FacturacionError(
      `El pernocte ${pernocte.id} tiene check-out (${checkoutYmd}) posterior al fin del período (${fechaFin}). Ajustá el rango o cerrá estadías dentro del mes.`,
      'PERNOCTE_CRUZA_PERIODO',
    )
  }
}

async function cargarEmpresa(
  db: Firestore,
  empresaId: string,
): Promise<{ id: string; nombre: string; cuit: string; raw: Record<string, unknown> }> {
  const id = empresaId.trim()
  if (!id) {
    throw new FacturacionError('Indicá la empresa contratista.', 'DATOS_INVALIDOS')
  }
  const snap = await getDoc(doc(db, COL_PADRON_EMPRESAS, id))
  if (!snap.exists()) {
    throw new FacturacionError('Empresa no encontrada en el padrón.', 'EMPRESA_NO_ENCONTRADA')
  }
  const raw = snap.data() as Record<string, unknown>
  const nombre =
    typeof raw.nombre === 'string' && raw.nombre.trim()
      ? normalizarNombreEmpresa(raw.nombre)
      : ''
  const cuit = typeof raw.cuit === 'string' ? raw.cuit.trim() : ''
  if (!nombre) {
    throw new FacturacionError('La empresa no tiene nombre válido en el padrón.', 'DATOS_INVALIDOS')
  }
  return { id: snap.id, nombre, cuit, raw }
}

async function fetchRegistrosComedorPendientes(
  db: Firestore,
  empresaNombre: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<RegistroComedor[]> {
  const q = query(
    collection(db, COL_REGISTROS_COMEDOR),
    where('diaOperativo', '>=', fechaInicio),
    where('diaOperativo', '<=', fechaFin),
  )
  const snap = await getDocs(q)
  const rows: RegistroComedor[] = []
  snap.forEach((d) => {
    const row = mapRegistroComedor(d.id, d.data() as Record<string, unknown>)
    if (!empresasCoinciden(row.empresa, empresaNombre)) return
    if (!esConsumoLiquidable(row.liquidado)) return
    rows.push(row)
  })
  return rows
}

async function fetchHistorialPernoctesPendientes(
  db: Firestore,
  empresaNombre: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<HistorialPernocte[]> {
  const snap = await getDocs(collection(db, COL_HISTORIAL_PERNOCTES))
  const rows: HistorialPernocte[] = []
  snap.forEach((d) => {
    const row = mapHistorial(d.id, d.data() as Record<string, unknown>)
    if (!empresasCoinciden(row.empresa, empresaNombre)) return
    if (!esConsumoLiquidable(row.liquidado)) return
    const noches = nochesEnRango(row.fechaCheckIn, row.fechaCheckOut, fechaInicio, fechaFin)
    if (noches <= 0) return
    rows.push(row)
  })
  return rows
}

function leerSaldoContratista(raw: Record<string, unknown>): number {
  return leerSaldoCliente(raw)
}

function alicuotaIva(listaPrecios: ListaPreciosContratista): number {
  const pct = listaPrecios.alicuotaIvaPct
  return Number.isFinite(pct) && pct! >= 0 ? pct! : 21
}

function precioNeto(listaPrecios: ListaPreciosContratista, concepto: ConceptoLiquidacion): number {
  const p = listaPrecios.netoPorConcepto[concepto]
  return Number.isFinite(p) && p! >= 0 ? p! : 0
}

function construirDetallesYTotales(
  conteos: ConteosConcepto,
  listaPrecios: ListaPreciosContratista,
): {
  detalles: DetalleLiquidacionContratista[]
  subtotalNeto: number
  montoIva: number
  totalFacturado: number
} {
  const detalles: DetalleLiquidacionContratista[] = []
  let subtotalNeto = 0

  const ordenConceptos: ConceptoLiquidacion[] = [
    'NOCHE',
    'DESAYUNO',
    'ALMUERZO',
    'REFRIGERIO_ALMUERZO',
    'MERIENDA',
    'VIANDA',
    'CENA',
    'CENA_NOCHERO',
  ]

  for (const concepto of ordenConceptos) {
    const cantidad = conteos[concepto]
    if (cantidad <= 0) continue
    const precioUnitarioNeto = precioNeto(listaPrecios, concepto)
    const subtotal = roundMoney(cantidad * precioUnitarioNeto)
    detalles.push({
      concepto,
      descripcion: `${cantidad} ${ETIQUETAS_CONCEPTO_LIQUIDACION[concepto]}`,
      cantidad,
      precioUnitarioNeto,
      subtotalNeto: subtotal,
    })
    subtotalNeto = roundMoney(subtotalNeto + subtotal)
  }

  const ivaPct = alicuotaIva(listaPrecios)
  const montoIva = roundMoney(subtotalNeto * (ivaPct / 100))
  const totalFacturado = roundMoney(subtotalNeto + montoIva)

  return { detalles, subtotalNeto, montoIva, totalFacturado }
}

type ConsumosPendientes = {
  registros: RegistroComedor[]
  pernoctes: HistorialPernocte[]
  conteos: ConteosConcepto
}

async function agruparConsumosPendientes(
  db: Firestore,
  empresaNombre: string,
  fechaInicio: string,
  fechaFin: string,
  validarPernoctes: boolean,
): Promise<ConsumosPendientes> {
  const [registros, pernoctes] = await Promise.all([
    fetchRegistrosComedorPendientes(db, empresaNombre, fechaInicio, fechaFin),
    fetchHistorialPernoctesPendientes(db, empresaNombre, fechaInicio, fechaFin),
  ])

  const conteos = conteosVacios()

  for (const r of registros) {
    if (!esConsumoLiquidable(r.liquidado)) {
      throw new FacturacionError(
        `El registro de comedor ${r.id} ya está liquidado.`,
        'CONSUMO_YA_LIQUIDADO',
      )
    }
    acumularRegistroComedor(conteos, r)
  }

  for (const h of pernoctes) {
    if (!esConsumoLiquidable(h.liquidado)) {
      throw new FacturacionError(
        `El pernocte ${h.id} ya está liquidado.`,
        'CONSUMO_YA_LIQUIDADO',
      )
    }
    if (validarPernoctes) validarPernocteParaLiquidacion(h, fechaFin)
    conteos.NOCHE += nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, fechaInicio, fechaFin)
  }

  return { registros, pernoctes, conteos }
}

function formatearNumeroLiq(anio: number, secuencial: number): string {
  return `LIQ-${anio}-${String(secuencial).padStart(6, '0')}`
}

function reservarNumeroLiquidacion(
  tx: Transaction,
  db: Firestore,
  contadorSnap: DocumentSnapshot,
  ahora: Date,
): { numero: string; anio: number; secuencial: number } {
  const anioActual = ahora.getFullYear()
  const contadorRef = doc(db, COL_CONTADORES, CONTADOR_NUMERACION_LIQ)

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

  return { anio: anioActual, secuencial, numero: formatearNumeroLiq(anioActual, secuencial) }
}

/**
 * Agrupa consumos no liquidados en memoria. No persiste ni bloquea documentos.
 */
export async function generarPreviewLiquidacion(
  db: Firestore,
  empresaId: string,
  fechaInicio: string,
  fechaFin: string,
  listaPrecios: ListaPreciosContratista,
): Promise<PreviewLiquidacionContratista> {
  validarRangoFechas(fechaInicio, fechaFin)
  const empresa = await cargarEmpresa(db, empresaId)

  const { registros, pernoctes, conteos } = await agruparConsumosPendientes(
    db,
    empresa.nombre,
    fechaInicio,
    fechaFin,
    true,
  )

  if (registros.length === 0 && pernoctes.length === 0) {
    throw new FacturacionError(
      'No hay consumos pendientes de liquidar en el período indicado.',
      'SIN_CONSUMOS',
    )
  }

  const { detalles, subtotalNeto, montoIva, totalFacturado } = construirDetallesYTotales(
    conteos,
    listaPrecios,
  )

  return {
    estado: 'BORRADOR',
    empresaId: empresa.id,
    empresaNombre: empresa.nombre,
    empresaCuit: empresa.cuit,
    fechaInicio,
    fechaFin,
    totalViandas: conteos.VIANDA,
    totalNoches: conteos.NOCHE,
    detalles,
    subtotalNeto,
    montoIva,
    totalFacturado,
    registrosComedorIds: registros.map((r) => r.id),
    historialPernocteIds: pernoctes.map((h) => h.id),
  }
}

async function marcarConsumosLiquidadosEnChunks(
  db: Firestore,
  liquidacionId: string,
  registrosIds: string[],
  pernoctesIds: string[],
): Promise<void> {
  let batch = writeBatch(db)
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const id of registrosIds) {
    batch.update(doc(db, COL_REGISTROS_COMEDOR, id), {
      liquidado: true,
      liquidacionId,
    })
    ops++
    if (ops >= BATCH_CHUNK_SIZE) await flush()
  }

  for (const id of pernoctesIds) {
    batch.update(doc(db, COL_HISTORIAL_PERNOCTES, id), {
      liquidado: true,
      liquidacionId,
    })
    ops++
    if (ops >= BATCH_CHUNK_SIZE) await flush()
  }

  await flush()
}

async function desmarcarConsumosLiquidadosEnChunks(
  db: Firestore,
  registrosIds: string[],
  pernoctesIds: string[],
): Promise<void> {
  let batch = writeBatch(db)
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const id of registrosIds) {
    batch.update(doc(db, COL_REGISTROS_COMEDOR, id), {
      liquidado: false,
      liquidacionId: deleteField(),
    })
    ops++
    if (ops >= BATCH_CHUNK_SIZE) await flush()
  }

  for (const id of pernoctesIds) {
    batch.update(doc(db, COL_HISTORIAL_PERNOCTES, id), {
      liquidado: false,
      liquidacionId: deleteField(),
    })
    ops++
    if (ops >= BATCH_CHUNK_SIZE) await flush()
  }

  await flush()
}

/**
 * Emite la liquidación: reserva número, crea documento, actualiza cuenta corriente
 * del contratista y marca consumos en batches (chunking ≤450 ops).
 */
export async function emitirLiquidacion(
  db: Firestore,
  input: EmitirLiquidacionInput,
): Promise<EmitirLiquidacionResult> {
  const fechaInicio = input.fechaInicio.trim()
  const fechaFin = input.fechaFin.trim()
  validarRangoFechas(fechaInicio, fechaFin)

  if (!input.usuarioUid?.trim()) {
    throw new FacturacionError('Usuario emisor inválido.', 'DATOS_INVALIDOS')
  }

  const preview = await generarPreviewLiquidacion(
    db,
    input.empresaId,
    fechaInicio,
    fechaFin,
    input.listaPrecios,
  )

  const ahora = new Date()
  const liquidacionRef = doc(collection(db, COL_LIQUIDACIONES))
  const contadorRef = doc(db, COL_CONTADORES, CONTADOR_NUMERACION_LIQ)
  const empresaRef = doc(db, COL_PADRON_EMPRESAS, preview.empresaId)

  const txResult = await runTransaction(db, async (tx) => {
    const [contadorSnap, empresaSnap] = await Promise.all([
      tx.get(contadorRef),
      tx.get(empresaRef),
    ])

    if (!empresaSnap.exists()) {
      throw new FacturacionError('Empresa no encontrada en el padrón.', 'EMPRESA_NO_ENCONTRADA')
    }

    const { numero, anio, secuencial } = reservarNumeroLiquidacion(tx, db, contadorSnap, ahora)
    const empresaRaw = empresaSnap.data() as Record<string, unknown>
    const saldoAnterior = leerSaldoContratista(empresaRaw)
    const saldoCliente = roundMoney(saldoAnterior + preview.totalFacturado)

    tx.set(liquidacionRef, {
      numero,
      anio,
      secuencial,
      empresaId: preview.empresaId,
      empresaNombre: preview.empresaNombre,
      empresaCuit: preview.empresaCuit,
      fechaInicio: preview.fechaInicio,
      fechaFin: preview.fechaFin,
      totalViandas: preview.totalViandas,
      totalNoches: preview.totalNoches,
      detalles: preview.detalles,
      subtotalNeto: preview.subtotalNeto,
      montoIva: preview.montoIva,
      totalFacturado: preview.totalFacturado,
      estado: 'EMITIDA',
      registrosComedorIds: preview.registrosComedorIds,
      historialPernocteIds: preview.historialPernocteIds,
      ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
      creadoPorUid: input.usuarioUid.trim(),
      creadoPorNombre: input.usuarioNombre.trim() || 'Gerencia',
      creadoEn: serverTimestamp(),
      emitidoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    })

    tx.set(
      empresaRef,
      {
        ...patchCondicionesSaldoCliente(empresaRaw, saldoCliente),
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid.trim(),
      },
      { merge: true },
    )

    return {
      numero,
      totalFacturado: preview.totalFacturado,
      saldoCliente,
      registrosMarcados: preview.registrosComedorIds.length,
      pernoctesMarcados: preview.historialPernocteIds.length,
    }
  })

  await marcarConsumosLiquidadosEnChunks(
    db,
    liquidacionRef.id,
    preview.registrosComedorIds,
    preview.historialPernocteIds,
  )

  return {
    liquidacionId: liquidacionRef.id,
    ...txResult,
  }
}

/**
 * Anula una liquidación EMITIDA: revierte saldo CC, marca ANULADA y desbloquea consumos en batches.
 */
export async function anularLiquidacion(
  db: Firestore,
  input: AnularLiquidacionInput,
): Promise<AnularLiquidacionResult> {
  const liquidacionId = input.liquidacionId?.trim()
  if (!liquidacionId) {
    throw new FacturacionError('Indicá la liquidación a anular.', 'DATOS_INVALIDOS')
  }
  if (!input.usuarioUid?.trim()) {
    throw new FacturacionError('Usuario invalido.', 'DATOS_INVALIDOS')
  }

  const liqRef = doc(db, COL_LIQUIDACIONES, liquidacionId)

  const txResult = await runTransaction(db, async (tx) => {
    const liqSnap = await tx.get(liqRef)
    if (!liqSnap.exists()) {
      throw new FacturacionError('Liquidación no encontrada.', 'NOT_FOUND')
    }

    const liq = mapLiquidacionContratista(liqSnap.id, liqSnap.data() as Record<string, unknown>)
    if (liq.estado !== 'EMITIDA') {
      throw new FacturacionError(
        `Solo se pueden anular liquidaciones EMITIDAS (actual: "${liq.estado}").`,
        'ESTADO_INVALIDO',
      )
    }

    const empresaRef = doc(db, COL_PADRON_EMPRESAS, liq.empresaId)
    const empresaSnap = await tx.get(empresaRef)
    if (!empresaSnap.exists()) {
      throw new FacturacionError('Empresa contratista no encontrada.', 'EMPRESA_NO_ENCONTRADA')
    }

    const empresaRaw = empresaSnap.data() as Record<string, unknown>
    const saldoAnterior = leerSaldoContratista(empresaRaw)
    const saldoCliente = roundMoney(
      Math.max(0, saldoAnterior - liq.totalFacturado),
    )

    tx.update(liqRef, {
      estado: 'ANULADA',
      anuladoPorUid: input.usuarioUid.trim(),
      anuladoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
      ...(input.motivoAnulacion?.trim()
        ? { motivoAnulacion: input.motivoAnulacion.trim() }
        : {}),
    })

    tx.set(
      empresaRef,
      {
        ...patchCondicionesSaldoCliente(empresaRaw, saldoCliente),
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid.trim(),
      },
      { merge: true },
    )

    return {
      numero: liq.numero,
      totalRevertido: liq.totalFacturado,
      saldoCliente,
      registrosComedorIds: liq.registrosComedorIds,
      historialPernocteIds: liq.historialPernocteIds,
    }
  })

  await desmarcarConsumosLiquidadosEnChunks(
    db,
    txResult.registrosComedorIds,
    txResult.historialPernocteIds,
  )

  return {
    liquidacionId,
    numero: txResult.numero,
    totalRevertido: txResult.totalRevertido,
    consumosDesbloqueados:
      txResult.registrosComedorIds.length + txResult.historialPernocteIds.length,
    saldoCliente: txResult.saldoCliente,
  }
}

export function mapLiquidacionContratista(
  id: string,
  data: Record<string, unknown>,
): LiquidacionContratista {
  const estadoRaw = data.estado
  const estado =
    estadoRaw === 'EMITIDA' || estadoRaw === 'ANULADA' || estadoRaw === 'BORRADOR'
      ? estadoRaw
      : 'BORRADOR'

  const detallesRaw = data.detalles
  const detalles: DetalleLiquidacionContratista[] = []
  if (Array.isArray(detallesRaw)) {
    for (const row of detallesRaw) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const concepto = o.concepto as ConceptoLiquidacion
      if (!concepto) continue
      detalles.push({
        concepto,
        descripcion: typeof o.descripcion === 'string' ? o.descripcion : '',
        cantidad: Number(o.cantidad) || 0,
        precioUnitarioNeto: Number(o.precioUnitarioNeto) || 0,
        subtotalNeto: Number(o.subtotalNeto) || 0,
      })
    }
  }

  return {
    id,
    numero: typeof data.numero === 'string' ? data.numero : '',
    anio: Number(data.anio) || 0,
    secuencial: Number(data.secuencial) || 0,
    empresaId: typeof data.empresaId === 'string' ? data.empresaId : '',
    empresaNombre: typeof data.empresaNombre === 'string' ? data.empresaNombre : '',
    empresaCuit: typeof data.empresaCuit === 'string' ? data.empresaCuit : '',
    fechaInicio: typeof data.fechaInicio === 'string' ? data.fechaInicio : '',
    fechaFin: typeof data.fechaFin === 'string' ? data.fechaFin : '',
    totalViandas: Number(data.totalViandas) || 0,
    totalNoches: Number(data.totalNoches) || 0,
    detalles,
    subtotalNeto: Number(data.subtotalNeto) || 0,
    montoIva: Number(data.montoIva) || 0,
    totalFacturado: Number(data.totalFacturado) || 0,
    estado,
    registrosComedorIds: Array.isArray(data.registrosComedorIds)
      ? (data.registrosComedorIds as string[])
      : [],
    historialPernocteIds: Array.isArray(data.historialPernocteIds)
      ? (data.historialPernocteIds as string[])
      : [],
    observaciones:
      typeof data.observaciones === 'string' && data.observaciones.trim()
        ? data.observaciones.trim()
        : undefined,
    creadoPorUid: typeof data.creadoPorUid === 'string' ? data.creadoPorUid : '',
    creadoPorNombre: typeof data.creadoPorNombre === 'string' ? data.creadoPorNombre : '',
    creadoEn: data.creadoEn as Timestamp,
    emitidoEn: data.emitidoEn as Timestamp | undefined,
    actualizadoEn: data.actualizadoEn as Timestamp | undefined,
    anuladoPorUid:
      typeof data.anuladoPorUid === 'string' ? data.anuladoPorUid : undefined,
    anuladoEn: data.anuladoEn as Timestamp | undefined,
    motivoAnulacion:
      typeof data.motivoAnulacion === 'string' && data.motivoAnulacion.trim()
        ? data.motivoAnulacion.trim()
        : undefined,
  }
}
