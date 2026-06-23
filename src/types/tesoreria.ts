import type { Timestamp } from 'firebase/firestore'
import type { MonedaCompra } from './compras'

/** Estados del ciclo de vida de una factura de proveedor. */
export type EstadoFacturaProveedor =
  | 'PENDIENTE_PAGO'
  | 'PAGO_PARCIAL'
  | 'PAGADA'
  | 'ANULADA'

/** Documento Firestore en `facturas_proveedores/{id}`. */
export interface FacturaProveedorDoc {
  /** Número legal completo, ej. "A-0001-00004562". */
  numeroFactura: string
  proveedorId: string
  /** Snapshot al momento del alta. */
  proveedorNombre: string
  proveedorCuit: string
  ordenCompraId: string
  /** Snapshot, ej. "OC-2026-000042". */
  ordenCompraNumero: string
  fechaEmision: Timestamp
  /** YYYY-MM-DD */
  fechaVencimiento: string
  neto: number
  montoIva: number
  montoPercepciones: number
  total: number
  /** Saldo adeudado de esta factura (inicialmente = total). */
  saldoPendiente: number
  estado: EstadoFacturaProveedor
  moneda: MonedaCompra
  observaciones?: string
  creadoPorUid: string
  creadoPorNombre: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
  anuladoPorUid?: string
  anuladoPorNombre?: string
  motivoAnulacion?: string
  fechaAnulacion?: Timestamp
}

export interface FacturaProveedor extends FacturaProveedorDoc {
  id: string
}

/** Payload para registrar una factura contra una OC recibida. */
export interface RegistrarFacturaProveedorInput {
  numeroFactura: string
  proveedorId: string
  ordenCompraId: string
  fechaEmision: Date
  /** YYYY-MM-DD */
  fechaVencimiento: string
  neto: number
  montoIva: number
  montoPercepciones: number
  total: number
  moneda?: MonedaCompra
  observaciones?: string
  usuarioUid: string
  usuarioNombre: string
}

export interface ResultadoRegistrarFacturaProveedor {
  facturaId: string
  numeroFactura: string
  ordenCompraId: string
  ordenCompraNumero: string
  saldoPendiente: number
  montoFacturadoAcumuladoOc: number
  saldoProveedor: number
}

// ─── Órdenes de pago ───────────────────────────────────────────────────────

export type MetodoPago = 'TRANSFERENCIA' | 'CHEQUE' | 'EFECTIVO'

export type EstadoOrdenPago = 'EMITIDA' | 'ANULADA'

/** Detalle de imputación de una OP sobre una factura. */
export interface FacturaAplicadaOrdenPago {
  facturaId: string
  numeroFactura: string
  montoAplicado: number
}

/** Documento Firestore en `ordenes_pago/{id}`. */
export interface OrdenPagoDoc {
  /** Human-readable, ej. "OP-2026-000015". */
  numero: string
  anio: number
  secuencial: number
  proveedorId: string
  proveedorNombre: string
  fechaPago: Timestamp
  montoTotal: number
  metodoPago: MetodoPago
  /** Comprobante bancario, CBU destino, número de cheque, etc. */
  referenciaPago: string
  facturasAplicadas: FacturaAplicadaOrdenPago[]
  estado: EstadoOrdenPago
  observaciones?: string
  creadoPorUid: string
  creadoPorNombre: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
  anuladoPorUid?: string
  anuladoPorNombre?: string
  motivoAnulacion?: string
  fechaAnulacion?: Timestamp
}

export interface OrdenPago extends OrdenPagoDoc {
  id: string
}

export interface ContadorNumeracionOp {
  anio: number
  ultimoSecuencial: number
  actualizadoEn: Timestamp
}

export interface FacturaAplicadaOrdenPagoInput {
  facturaId: string
  montoAplicado: number
}

export interface RegistrarOrdenPagoInput {
  proveedorId: string
  fechaPago: Date
  montoTotal: number
  metodoPago: MetodoPago
  referenciaPago: string
  facturasAplicadas: FacturaAplicadaOrdenPagoInput[]
  observaciones?: string
  usuarioUid: string
  usuarioNombre: string
}

export interface ResultadoRegistrarOrdenPago {
  ordenPagoId: string
  numero: string
  montoTotal: number
  saldoProveedor: number
  facturasActualizadas: {
    facturaId: string
    numeroFactura: string
    saldoPendiente: number
    estado: EstadoFacturaProveedor
  }[]
}

/** Campos comunes para anular documentos de tesorería. */
export interface AnularDocumentoTesoreriaInput {
  motivoAnulacion: string
  usuarioUid: string
  usuarioNombre: string
}

export interface AnularOrdenPagoInput extends AnularDocumentoTesoreriaInput {
  ordenPagoId: string
}

export interface ResultadoAnularOrdenPago {
  ordenPagoId: string
  numero: string
  montoTotal: number
  saldoProveedor: number
  facturasRevertidas: {
    facturaId: string
    numeroFactura: string
    saldoPendiente: number
    estado: EstadoFacturaProveedor
  }[]
}

export interface AnularFacturaProveedorInput extends AnularDocumentoTesoreriaInput {
  facturaId: string
}

export interface ResultadoAnularFacturaProveedor {
  facturaId: string
  numeroFactura: string
  ordenCompraId: string
  montoFacturadoAcumuladoOc: number
  facturaCargada: boolean
  saldoProveedor: number
}
