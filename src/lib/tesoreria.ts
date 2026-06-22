import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COL_ORDENES_COMPRA } from './ordenesCompra'
import type { EstadoOrdenCompra, OrdenCompraDoc } from '../types/compras'
import type {
  EstadoFacturaProveedor,
  EstadoOrdenPago,
  FacturaAplicadaOrdenPago,
  FacturaAplicadaOrdenPagoInput,
  FacturaProveedorDoc,
  MetodoPago,
  RegistrarFacturaProveedorInput,
  RegistrarOrdenPagoInput,
  ResultadoRegistrarFacturaProveedor,
  ResultadoRegistrarOrdenPago,
  AnularOrdenPagoInput,
  AnularFacturaProveedorInput,
  ResultadoAnularOrdenPago,
  ResultadoAnularFacturaProveedor,
  OrdenPagoDoc,
} from '../types/tesoreria'

export const COL_FACTURAS_PROVEEDORES = 'facturas_proveedores'
export const COL_FACTURAS_PROVEEDORES_CLAVES = 'facturas_proveedores_claves'
export const COL_ORDENES_PAGO = 'ordenes_pago'
export const COL_PADRON_EMPRESAS = 'padron_empresas'
export const COL_CONTADORES = 'contadores'
export const CONTADOR_NUMERACION_OP = 'numeracion_op'

const ESTADOS_OC_FACTURABLES: EstadoOrdenCompra[] = ['RECIBIDA_PARCIAL', 'COMPLETADA']
const MONEY_PRECISION = 100
const METODOS_PAGO: MetodoPago[] = ['TRANSFERENCIA', 'CHEQUE', 'EFECTIVO']

export type TesoreriaErrorCode =
  | 'NOT_FOUND'
  | 'ESTADO_INVALIDO'
  | 'PROVEEDOR_INVALIDO'
  | 'SIN_RECEPCION'
  | 'MONTO_EXCEDIDO'
  | 'FACTURA_DUPLICADA'
  | 'DATOS_INVALIDOS'
  | 'TOTAL_INCONSISTENTE'
  | 'FACTURA_INVALIDA'
  | 'MONTO_APLICADO_EXCEDIDO'
  | 'MONTO_TOTAL_INCONSISTENTE'
  | 'YA_ANULADA'
  | 'FACTURA_CON_PAGOS'

export class TesoreriaError extends Error {
  readonly code: TesoreriaErrorCode

  constructor(message: string, code: TesoreriaErrorCode) {
    super(message)
    this.name = 'TesoreriaError'
    this.code = code
  }
}

function roundMoney(n: number): number {
  return Math.round(n * MONEY_PRECISION) / MONEY_PRECISION
}

function moneyMayor(a: number, b: number): boolean {
  return roundMoney(a) > roundMoney(b)
}

function moneyMenor(a: number, b: number): boolean {
  return roundMoney(a) < roundMoney(b)
}

function moneyIgual(a: number, b: number, tolerancia = 0.02): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= tolerancia
}

function saldoFacturaCubierto(saldo: number): boolean {
  return roundMoney(saldo) <= 0
}

function parseOrdenCompra(raw: Record<string, unknown>): OrdenCompraDoc {
  return raw as unknown as OrdenCompraDoc
}

function parseFacturaProveedor(raw: Record<string, unknown>): FacturaProveedorDoc {
  return raw as unknown as FacturaProveedorDoc
}

function parseOrdenPago(raw: Record<string, unknown>): OrdenPagoDoc {
  return raw as unknown as OrdenPagoDoc
}

function validarMotivoAnulacion(motivo: string): string {
  const m = motivo.trim()
  if (!m || m.length > 2000) {
    throw new TesoreriaError(
      'Indicá un motivo de anulación (máx. 2000 caracteres).',
      'DATOS_INVALIDOS',
    )
  }
  return m
}

function normalizarNumeroFactura(n: string): string {
  return n.trim().toUpperCase()
}

export function claveFacturaProveedorDocId(proveedorId: string, numeroFactura: string): string {
  const p = proveedorId.trim()
  const n = normalizarNumeroFactura(numeroFactura).replace(/[/\\.#$[\]]/g, '_')
  return `${p}__${n}`
}

function formatearNumeroOp(anio: number, secuencial: number): string {
  return `OP-${anio}-${String(secuencial).padStart(6, '0')}`
}

function reservarNumeroOrdenPago(
  tx: Transaction,
  db: Firestore,
  contadorSnap: DocumentSnapshot,
  ahora: Date,
): { numero: string; anio: number; secuencial: number } {
  const anioActual = ahora.getFullYear()
  const contadorRef = doc(db, COL_CONTADORES, CONTADOR_NUMERACION_OP)

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

  return { anio: anioActual, secuencial, numero: formatearNumeroOp(anioActual, secuencial) }
}

function validarFechaYmd(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())
}

function validarTotalesFactura(input: RegistrarFacturaProveedorInput): void {
  const neto = roundMoney(input.neto)
  const iva = roundMoney(input.montoIva)
  const percepciones = roundMoney(input.montoPercepciones)
  const total = roundMoney(input.total)

  if (neto < 0 || iva < 0 || percepciones < 0 || total <= 0) {
    throw new TesoreriaError('Los importes deben ser positivos (total > 0).', 'DATOS_INVALIDOS')
  }

  const totalCalculado = roundMoney(neto + iva + percepciones)
  if (Math.abs(totalCalculado - total) > 0.02) {
    throw new TesoreriaError(
      `El total (${total}) no coincide con neto + IVA + percepciones (${totalCalculado}).`,
      'TOTAL_INCONSISTENTE',
    )
  }
}

function ocTieneRecepcionFisica(oc: OrdenCompraDoc): boolean {
  if ((oc.movimientosIngresoIds ?? []).length > 0) return true
  return (oc.items ?? []).some((it) => it.cantidadRecibida > 0)
}

function leerSaldoCuentaCorrienteProveedor(raw: Record<string, unknown>): number {
  const cond = raw.condicionesComerciales
  if (cond && typeof cond === 'object') {
    const saldo = Number((cond as Record<string, unknown>).saldoCuentaCorriente)
    if (Number.isFinite(saldo)) return roundMoney(Math.max(0, saldo))
  }
  const flat = Number(raw.saldoCuentaCorriente)
  if (Number.isFinite(flat)) return roundMoney(Math.max(0, flat))
  return 0
}

function agregarFacturasAplicadas(
  filas: FacturaAplicadaOrdenPagoInput[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const fila of filas) {
    const facturaId = fila.facturaId.trim()
    const monto = roundMoney(Number(fila.montoAplicado))
    if (!facturaId || !Number.isFinite(monto) || monto <= 0) {
      throw new TesoreriaError(
        'Cada imputación requiere facturaId y montoAplicado > 0.',
        'DATOS_INVALIDOS',
      )
    }
    map.set(facturaId, roundMoney((map.get(facturaId) ?? 0) + monto))
  }
  if (map.size === 0) {
    throw new TesoreriaError('Indicá al menos una factura a pagar.', 'DATOS_INVALIDOS')
  }
  return map
}

function calcularEstadoFacturaTrasPago(saldoRestante: number): EstadoFacturaProveedor {
  if (saldoFacturaCubierto(saldoRestante)) return 'PAGADA'
  return 'PAGO_PARCIAL'
}

/** Tras revertir un pago: saldo pleno → PENDIENTE_PAGO; saldo intermedio → PAGO_PARCIAL. */
function calcularEstadoFacturaTrasReversoPago(
  saldoPendiente: number,
  totalFactura: number,
): EstadoFacturaProveedor {
  const saldo = roundMoney(saldoPendiente)
  const total = roundMoney(totalFactura)
  if (moneyIgual(saldo, total)) return 'PENDIENTE_PAGO'
  if (saldo > 0 && moneyMenor(saldo, total)) return 'PAGO_PARCIAL'
  if (moneyMayor(saldo, total)) {
    return 'PENDIENTE_PAGO'
  }
  return 'PENDIENTE_PAGO'
}

function validarMetodoPago(m: string): m is MetodoPago {
  return METODOS_PAGO.includes(m as MetodoPago)
}

/**
 * Registra una factura de proveedor vinculada a una OC ya recibida (total o parcialmente).
 */
export async function registrarFacturaProveedor(
  input: RegistrarFacturaProveedorInput,
  db: Firestore = getDb(),
): Promise<ResultadoRegistrarFacturaProveedor> {
  const numeroFactura = normalizarNumeroFactura(input.numeroFactura)
  const proveedorId = input.proveedorId.trim()
  const ordenCompraId = input.ordenCompraId.trim()
  const fechaVencimiento = input.fechaVencimiento.trim()

  if (!numeroFactura) {
    throw new TesoreriaError('Indicá el número de factura.', 'DATOS_INVALIDOS')
  }
  if (!proveedorId || !ordenCompraId) {
    throw new TesoreriaError('Indicá proveedor y orden de compra.', 'DATOS_INVALIDOS')
  }
  if (!validarFechaYmd(fechaVencimiento)) {
    throw new TesoreriaError('Fecha de vencimiento inválida (YYYY-MM-DD).', 'DATOS_INVALIDOS')
  }
  validarTotalesFactura(input)

  const neto = roundMoney(input.neto)
  const montoIva = roundMoney(input.montoIva)
  const montoPercepciones = roundMoney(input.montoPercepciones)
  const total = roundMoney(input.total)
  const moneda = input.moneda ?? 'ARS'

  const ocRef = doc(db, COL_ORDENES_COMPRA, ordenCompraId)
  const provRef = doc(db, COL_PADRON_EMPRESAS, proveedorId)
  const facturaRef = doc(collection(db, COL_FACTURAS_PROVEEDORES))
  const claveRef = doc(
    db,
    COL_FACTURAS_PROVEEDORES_CLAVES,
    claveFacturaProveedorDocId(proveedorId, numeroFactura),
  )

  return runTransaction(db, async (tx) => {
    const [ocSnap, provSnap, claveSnap] = await Promise.all([
      tx.get(ocRef),
      tx.get(provRef),
      tx.get(claveRef),
    ])

    if (!ocSnap.exists()) {
      throw new TesoreriaError('Orden de compra no encontrada.', 'NOT_FOUND')
    }
    if (!provSnap.exists()) {
      throw new TesoreriaError('Proveedor no encontrado en el padrón.', 'NOT_FOUND')
    }

    if (claveSnap.exists()) {
      const claveData = claveSnap.data() as Record<string, unknown>
      if (claveData.anulada !== true) {
        throw new TesoreriaError(
          `Ya existe la factura ${numeroFactura} para este proveedor.`,
          'FACTURA_DUPLICADA',
        )
      }
    }

    const oc = parseOrdenCompra(ocSnap.data() as Record<string, unknown>)
    if (!ESTADOS_OC_FACTURABLES.includes(oc.estado)) {
      throw new TesoreriaError(
        `La OC debe estar RECIBIDA_PARCIAL o COMPLETADA (actual: "${oc.estado}").`,
        'ESTADO_INVALIDO',
      )
    }
    if (oc.proveedorId !== proveedorId) {
      throw new TesoreriaError(
        'El proveedor de la factura no coincide con el de la orden de compra.',
        'PROVEEDOR_INVALIDO',
      )
    }
    if (!ocTieneRecepcionFisica(oc)) {
      throw new TesoreriaError(
        'La OC no tiene recepciones físicas registradas en depósito.',
        'SIN_RECEPCION',
      )
    }

    const montoFacturadoAcumulado = roundMoney(Number(oc.montoFacturadoAcumulado) || 0)
    const nuevoAcumulado = roundMoney(montoFacturadoAcumulado + total)
    if (moneyMayor(nuevoAcumulado, oc.total)) {
      throw new TesoreriaError(
        `El monto facturado acumulado (${nuevoAcumulado}) supera el total de la OC (${roundMoney(oc.total)}).`,
        'MONTO_EXCEDIDO',
      )
    }

    const provRaw = provSnap.data() as Record<string, unknown>
    const proveedorNombre =
      typeof provRaw.nombre === 'string' && provRaw.nombre.trim()
        ? provRaw.nombre.trim()
        : oc.proveedorNombre
    const proveedorCuit =
      typeof provRaw.cuit === 'string' && provRaw.cuit.trim()
        ? provRaw.cuit.trim()
        : oc.proveedorCuit

    const saldoAnteriorProveedor = leerSaldoCuentaCorrienteProveedor(provRaw)
    const saldoCuentaCorrienteProveedor = roundMoney(saldoAnteriorProveedor + total)

    const estadoInicial: EstadoFacturaProveedor = 'PENDIENTE_PAGO'
    const facturasAsociadasIds = [...(oc.facturasAsociadasIds ?? []), facturaRef.id]

    tx.set(facturaRef, {
      numeroFactura,
      proveedorId,
      proveedorNombre,
      proveedorCuit,
      ordenCompraId,
      ordenCompraNumero: oc.numero,
      fechaEmision: Timestamp.fromDate(input.fechaEmision),
      fechaVencimiento,
      neto,
      montoIva,
      montoPercepciones,
      total,
      saldoPendiente: total,
      estado: estadoInicial,
      moneda,
      ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
      creadoPorUid: input.usuarioUid,
      creadoPorNombre: input.usuarioNombre,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    })

    tx.set(claveRef, {
      proveedorId,
      numeroFactura,
      facturaId: facturaRef.id,
      ordenCompraId,
      anulada: false,
      creadoEn: serverTimestamp(),
    })

    tx.update(ocRef, {
      facturaCargada: true,
      deudaGenerada: true,
      facturasAsociadasIds,
      montoFacturadoAcumulado: nuevoAcumulado,
      actualizadoEn: serverTimestamp(),
    })

    tx.set(
      provRef,
      {
        condicionesComerciales: {
          saldoCuentaCorriente: saldoCuentaCorrienteProveedor,
        },
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid,
      },
      { merge: true },
    )

    return {
      facturaId: facturaRef.id,
      numeroFactura,
      ordenCompraId,
      ordenCompraNumero: oc.numero,
      saldoPendiente: total,
      montoFacturadoAcumuladoOc: nuevoAcumulado,
      saldoCuentaCorrienteProveedor,
    }
  })
}

/**
 * Emite una orden de pago e imputa el monto sobre una o más facturas del proveedor.
 */
export async function registrarOrdenPago(
  input: RegistrarOrdenPagoInput,
  db: Firestore = getDb(),
): Promise<ResultadoRegistrarOrdenPago> {
  const proveedorId = input.proveedorId.trim()
  const referenciaPago = input.referenciaPago.trim()
  const montoTotal = roundMoney(input.montoTotal)

  if (!proveedorId) {
    throw new TesoreriaError('Indicá el proveedor.', 'DATOS_INVALIDOS')
  }
  if (!referenciaPago) {
    throw new TesoreriaError('Indicá la referencia de pago.', 'DATOS_INVALIDOS')
  }
  if (!validarMetodoPago(input.metodoPago)) {
    throw new TesoreriaError('Método de pago inválido.', 'DATOS_INVALIDOS')
  }
  if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
    throw new TesoreriaError('El monto total debe ser mayor a cero.', 'DATOS_INVALIDOS')
  }

  const montosPorFactura = agregarFacturasAplicadas(input.facturasAplicadas)
  const sumaImputaciones = roundMoney(
    [...montosPorFactura.values()].reduce((acc, v) => acc + v, 0),
  )
  if (Math.abs(sumaImputaciones - montoTotal) > 0.02) {
    throw new TesoreriaError(
      `El monto total (${montoTotal}) no coincide con la suma imputada (${sumaImputaciones}).`,
      'MONTO_TOTAL_INCONSISTENTE',
    )
  }

  const facturaIds = [...montosPorFactura.keys()]
  const provRef = doc(db, COL_PADRON_EMPRESAS, proveedorId)
  const contadorRef = doc(db, COL_CONTADORES, CONTADOR_NUMERACION_OP)
  const opRef = doc(collection(db, COL_ORDENES_PAGO))

  return runTransaction(db, async (tx) => {
    const lecturas: Promise<DocumentSnapshot>[] = [
      tx.get(provRef),
      tx.get(contadorRef),
      ...facturaIds.map((id) => tx.get(doc(db, COL_FACTURAS_PROVEEDORES, id))),
    ]
    const snaps = await Promise.all(lecturas)
    const provSnap = snaps[0]
    const contadorSnap = snaps[1]
    const facturaSnaps = snaps.slice(2)

    if (!provSnap.exists()) {
      throw new TesoreriaError('Proveedor no encontrado en el padrón.', 'NOT_FOUND')
    }

    const provRaw = provSnap.data() as Record<string, unknown>
    const proveedorNombre =
      typeof provRaw.nombre === 'string' && provRaw.nombre.trim()
        ? provRaw.nombre.trim()
        : proveedorId

    const facturasAplicadas: FacturaAplicadaOrdenPago[] = []
    const facturasActualizadas: ResultadoRegistrarOrdenPago['facturasActualizadas'] = []

    for (let i = 0; i < facturaIds.length; i++) {
      const facturaId = facturaIds[i]
      const snap = facturaSnaps[i]
      const montoAplicado = montosPorFactura.get(facturaId)!

      if (!snap.exists()) {
        throw new TesoreriaError(`Factura ${facturaId} no encontrada.`, 'NOT_FOUND')
      }

      const factura = parseFacturaProveedor(snap.data() as Record<string, unknown>)

      if (factura.proveedorId !== proveedorId) {
        throw new TesoreriaError(
          `La factura ${factura.numeroFactura} no pertenece al proveedor indicado.`,
          'PROVEEDOR_INVALIDO',
        )
      }
      if (factura.estado === 'ANULADA') {
        throw new TesoreriaError(
          `La factura ${factura.numeroFactura} está anulada.`,
          'FACTURA_INVALIDA',
        )
      }
      if (factura.estado === 'PAGADA' || saldoFacturaCubierto(factura.saldoPendiente)) {
        throw new TesoreriaError(
          `La factura ${factura.numeroFactura} no tiene saldo pendiente.`,
          'FACTURA_INVALIDA',
        )
      }
      if (moneyMayor(montoAplicado, factura.saldoPendiente)) {
        throw new TesoreriaError(
          `El monto aplicado (${montoAplicado}) supera el saldo de ${factura.numeroFactura} (${roundMoney(factura.saldoPendiente)}).`,
          'MONTO_APLICADO_EXCEDIDO',
        )
      }

      const saldoRestante = roundMoney(factura.saldoPendiente - montoAplicado)
      const nuevoEstado = calcularEstadoFacturaTrasPago(saldoRestante)
      const saldoPendienteFinal = saldoFacturaCubierto(saldoRestante) ? 0 : saldoRestante

      facturasAplicadas.push({
        facturaId,
        numeroFactura: factura.numeroFactura,
        montoAplicado,
      })

      tx.update(doc(db, COL_FACTURAS_PROVEEDORES, facturaId), {
        saldoPendiente: saldoPendienteFinal,
        estado: nuevoEstado,
        actualizadoEn: serverTimestamp(),
      })

      facturasActualizadas.push({
        facturaId,
        numeroFactura: factura.numeroFactura,
        saldoPendiente: saldoPendienteFinal,
        estado: nuevoEstado,
      })
    }

    const saldoAnteriorProveedor = leerSaldoCuentaCorrienteProveedor(provRaw)
    if (moneyMenor(saldoAnteriorProveedor, montoTotal)) {
      throw new TesoreriaError(
        `El saldo de cuenta corriente (${saldoAnteriorProveedor}) es insuficiente para el pago (${montoTotal}).`,
        'MONTO_EXCEDIDO',
      )
    }
    const saldoCuentaCorrienteProveedor = roundMoney(
      Math.max(0, saldoAnteriorProveedor - montoTotal),
    )

    const { numero, anio, secuencial } = reservarNumeroOrdenPago(
      tx,
      db,
      contadorSnap,
      input.fechaPago,
    )

    const estadoOp: EstadoOrdenPago = 'EMITIDA'

    tx.set(opRef, {
      numero,
      anio,
      secuencial,
      proveedorId,
      proveedorNombre,
      fechaPago: Timestamp.fromDate(input.fechaPago),
      montoTotal,
      metodoPago: input.metodoPago,
      referenciaPago,
      facturasAplicadas,
      estado: estadoOp,
      ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
      creadoPorUid: input.usuarioUid,
      creadoPorNombre: input.usuarioNombre,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    })

    tx.set(
      provRef,
      {
        condicionesComerciales: {
          saldoCuentaCorriente: saldoCuentaCorrienteProveedor,
        },
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid,
      },
      { merge: true },
    )

    return {
      ordenPagoId: opRef.id,
      numero,
      montoTotal,
      saldoCuentaCorrienteProveedor,
      facturasActualizadas,
    }
  })
}

/**
 * Anula una orden de pago emitida y revierte imputaciones en facturas y cuenta corriente.
 */
export async function anularOrdenPago(
  input: AnularOrdenPagoInput,
  db: Firestore = getDb(),
): Promise<ResultadoAnularOrdenPago> {
  const ordenPagoId = input.ordenPagoId.trim()
  const motivoAnulacion = validarMotivoAnulacion(input.motivoAnulacion)

  if (!ordenPagoId) {
    throw new TesoreriaError('Indicá la orden de pago a anular.', 'DATOS_INVALIDOS')
  }

  const opRef = doc(db, COL_ORDENES_PAGO, ordenPagoId)

  return runTransaction(db, async (tx) => {
    const opSnap = await tx.get(opRef)
    if (!opSnap.exists()) {
      throw new TesoreriaError('Orden de pago no encontrada.', 'NOT_FOUND')
    }

    const op = parseOrdenPago(opSnap.data() as Record<string, unknown>)
    if (op.estado === 'ANULADA') {
      throw new TesoreriaError('La orden de pago ya está anulada.', 'YA_ANULADA')
    }
    if (op.estado !== 'EMITIDA') {
      throw new TesoreriaError(
        `No se puede anular una OP en estado "${op.estado}".`,
        'ESTADO_INVALIDO',
      )
    }

    const facturasAplicadas = op.facturasAplicadas ?? []
    if (facturasAplicadas.length === 0) {
      throw new TesoreriaError('La OP no tiene facturas aplicadas.', 'DATOS_INVALIDOS')
    }

    const provRef = doc(db, COL_PADRON_EMPRESAS, op.proveedorId)
    const facturaSnaps = await Promise.all(
      facturasAplicadas.map((f) => tx.get(doc(db, COL_FACTURAS_PROVEEDORES, f.facturaId))),
    )
    const provSnap = await tx.get(provRef)

    if (!provSnap.exists()) {
      throw new TesoreriaError('Proveedor no encontrado en el padrón.', 'NOT_FOUND')
    }

    const facturasRevertidas: ResultadoAnularOrdenPago['facturasRevertidas'] = []

    for (let i = 0; i < facturasAplicadas.length; i++) {
      const aplicada = facturasAplicadas[i]
      const snap = facturaSnaps[i]

      if (!snap.exists()) {
        throw new TesoreriaError(
          `Factura ${aplicada.facturaId} no encontrada.`,
          'NOT_FOUND',
        )
      }

      const factura = parseFacturaProveedor(snap.data() as Record<string, unknown>)
      if (factura.estado === 'ANULADA') {
        throw new TesoreriaError(
          `La factura ${factura.numeroFactura} está anulada.`,
          'FACTURA_INVALIDA',
        )
      }

      const montoAplicado = roundMoney(aplicada.montoAplicado)
      const nuevoSaldo = roundMoney(factura.saldoPendiente + montoAplicado)
      const totalFactura = roundMoney(factura.total)

      if (moneyMayor(nuevoSaldo, totalFactura)) {
        throw new TesoreriaError(
          `Revertir el pago de ${factura.numeroFactura} superaría su total.`,
          'MONTO_EXCEDIDO',
        )
      }

      const nuevoEstado = calcularEstadoFacturaTrasReversoPago(nuevoSaldo, totalFactura)

      tx.update(doc(db, COL_FACTURAS_PROVEEDORES, aplicada.facturaId), {
        saldoPendiente: nuevoSaldo,
        estado: nuevoEstado,
        actualizadoEn: serverTimestamp(),
      })

      facturasRevertidas.push({
        facturaId: aplicada.facturaId,
        numeroFactura: factura.numeroFactura,
        saldoPendiente: nuevoSaldo,
        estado: nuevoEstado,
      })
    }

    const provRaw = provSnap.data() as Record<string, unknown>
    const saldoAnterior = leerSaldoCuentaCorrienteProveedor(provRaw)
    const montoTotal = roundMoney(op.montoTotal)
    const saldoCuentaCorrienteProveedor = roundMoney(saldoAnterior + montoTotal)

    tx.update(opRef, {
      estado: 'ANULADA',
      anuladoPorUid: input.usuarioUid,
      anuladoPorNombre: input.usuarioNombre,
      motivoAnulacion,
      fechaAnulacion: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    })

    tx.set(
      provRef,
      {
        condicionesComerciales: {
          saldoCuentaCorriente: saldoCuentaCorrienteProveedor,
        },
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid,
      },
      { merge: true },
    )

    return {
      ordenPagoId,
      numero: op.numero,
      montoTotal,
      saldoCuentaCorrienteProveedor,
      facturasRevertidas,
    }
  })
}

/**
 * Anula una factura sin pagos aplicados y revierte deuda en OC, padrón y clave de unicidad.
 */
export async function anularFacturaProveedor(
  input: AnularFacturaProveedorInput,
  db: Firestore = getDb(),
): Promise<ResultadoAnularFacturaProveedor> {
  const facturaId = input.facturaId.trim()
  const motivoAnulacion = validarMotivoAnulacion(input.motivoAnulacion)

  if (!facturaId) {
    throw new TesoreriaError('Indicá la factura a anular.', 'DATOS_INVALIDOS')
  }

  const facturaRef = doc(db, COL_FACTURAS_PROVEEDORES, facturaId)

  return runTransaction(db, async (tx) => {
    const facturaSnap = await tx.get(facturaRef)
    if (!facturaSnap.exists()) {
      throw new TesoreriaError('Factura no encontrada.', 'NOT_FOUND')
    }

    const factura = parseFacturaProveedor(facturaSnap.data() as Record<string, unknown>)
    if (factura.estado === 'ANULADA') {
      throw new TesoreriaError('La factura ya está anulada.', 'YA_ANULADA')
    }

    const total = roundMoney(factura.total)
    const saldo = roundMoney(factura.saldoPendiente)
    if (!moneyIgual(saldo, total)) {
      throw new TesoreriaError(
        'Solo se puede anular una factura sin pagos aplicados (saldoPendiente debe igualar al total). Anulá primero las órdenes de pago asociadas.',
        'FACTURA_CON_PAGOS',
      )
    }

    const ocRef = doc(db, COL_ORDENES_COMPRA, factura.ordenCompraId)
    const provRef = doc(db, COL_PADRON_EMPRESAS, factura.proveedorId)
    const claveRef = doc(
      db,
      COL_FACTURAS_PROVEEDORES_CLAVES,
      claveFacturaProveedorDocId(factura.proveedorId, factura.numeroFactura),
    )

    const [ocSnap, provSnap] = await Promise.all([tx.get(ocRef), tx.get(provRef)])

    if (!ocSnap.exists()) {
      throw new TesoreriaError('Orden de compra asociada no encontrada.', 'NOT_FOUND')
    }
    if (!provSnap.exists()) {
      throw new TesoreriaError('Proveedor no encontrado en el padrón.', 'NOT_FOUND')
    }

    const oc = parseOrdenCompra(ocSnap.data() as Record<string, unknown>)
    const provRaw = provSnap.data() as Record<string, unknown>
    const saldoAnterior = leerSaldoCuentaCorrienteProveedor(provRaw)

    if (moneyMenor(saldoAnterior, total)) {
      throw new TesoreriaError(
        `El saldo de cuenta corriente (${saldoAnterior}) es insuficiente para revertir la factura (${total}).`,
        'MONTO_EXCEDIDO',
      )
    }

    const montoFacturadoAcumuladoOc = roundMoney(
      Math.max(0, roundMoney(Number(oc.montoFacturadoAcumulado) || 0) - total),
    )
    const facturasAsociadasIds = (oc.facturasAsociadasIds ?? []).filter((id) => id !== facturaId)
    const facturaCargada = montoFacturadoAcumuladoOc > 0
    const saldoCuentaCorrienteProveedor = roundMoney(Math.max(0, saldoAnterior - total))

    tx.update(facturaRef, {
      estado: 'ANULADA',
      saldoPendiente: 0,
      anuladoPorUid: input.usuarioUid,
      anuladoPorNombre: input.usuarioNombre,
      motivoAnulacion,
      fechaAnulacion: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    })

    tx.delete(claveRef)

    tx.update(ocRef, {
      facturaCargada,
      deudaGenerada: facturaCargada,
      facturasAsociadasIds,
      montoFacturadoAcumulado: montoFacturadoAcumuladoOc,
      actualizadoEn: serverTimestamp(),
    })

    tx.set(
      provRef,
      {
        condicionesComerciales: {
          saldoCuentaCorriente: saldoCuentaCorrienteProveedor,
        },
        actualizadoEn: serverTimestamp(),
        actualizadoPorUid: input.usuarioUid,
      },
      { merge: true },
    )

    return {
      facturaId,
      numeroFactura: factura.numeroFactura,
      ordenCompraId: factura.ordenCompraId,
      montoFacturadoAcumuladoOc,
      facturaCargada,
      saldoCuentaCorrienteProveedor,
    }
  })
}
