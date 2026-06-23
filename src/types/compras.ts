import type { Timestamp } from 'firebase/firestore'
import type { TipoDocumentoRecepcion } from '../lib/movimientosInventario'

// ─── Padrón empresas (extensión proveedores) ───────────────────────────────

export type RolEmpresaPadron = 'CONTRATISTA' | 'PROVEEDOR' | 'CLIENTE'

export type TipoPersonaEmpresa = 'JURIDICA' | 'FISICA'

export type CondicionIva =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTO'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL'
  | 'NO_RESPONSABLE'

export interface CuentaBancariaProveedor {
  id: string
  banco: string
  cbu: string
  alias?: string
  moneda: 'ARS' | 'USD'
  esPrincipal: boolean
}

export interface CondicionesComercialesProveedor {
  plazoPagoDias: number
  monedaDefault: 'ARS' | 'USD'
  descuentoProntoPagoPct?: number
  limiteCredito?: number
  /** Pasivo: deuda con el proveedor (cuentas por pagar). */
  saldoProveedor?: number
  /** Activo: deuda del cliente/contratista con nosotros (cuentas por cobrar). */
  saldoCliente?: number
}

/** Extensión opcional del padrón para roles ERP (retrocompatible con docs legacy). */
export interface PadronEmpresaExtendido {
  roles?: RolEmpresaPadron[]
  tipoPersona?: TipoPersonaEmpresa
  razonSocial?: string
  condicionIva?: CondicionIva
  ingresosBrutos?: string
  inicioActividades?: string
  contacto?: {
    email?: string
    telefono?: string
    direccionFiscal?: string
    localidad?: string
    provincia?: string
    codigoPostal?: string
  }
  codigoInterno?: string
  proveedorActivo?: boolean
  contratistaActivo?: boolean
  cuentasBancarias?: CuentaBancariaProveedor[]
  condicionesComerciales?: CondicionesComercialesProveedor
  actualizadoEn?: Timestamp | null
  actualizadoPorUid?: string
}

// ─── Órdenes de compra ─────────────────────────────────────────────────────

export type EstadoOrdenCompra =
  | 'BORRADOR'
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'RECIBIDA_PARCIAL'
  | 'COMPLETADA'
  | 'CANCELADA'

export type EstadoLineaOrdenCompra =
  | 'PENDIENTE'
  | 'PARCIAL'
  | 'COMPLETA'
  | 'CANCELADA'

export type MonedaCompra = 'ARS' | 'USD'

export interface OrdenCompraLinea {
  lineaId: string
  insumoId: string
  nombreSnapshot: string
  unidadBase: 'Kg' | 'Lt' | 'Un'
  presentacion?: string
  factorPresentacion?: number
  cantidadSolicitada: number
  precioUnitario: number
  descuentoPorcentaje: number
  subtotalLinea: number
  cantidadRecibida: number
  cantidadPendiente: number
  estadoLinea: EstadoLineaOrdenCompra
  movimientosIngresoIds: string[]
}

export interface CambioEstadoOrdenCompra {
  estadoAnterior: EstadoOrdenCompra | null
  estadoNuevo: EstadoOrdenCompra
  fecha: Timestamp
  usuarioUid: string
  usuarioNombre: string
  comentario?: string
}

export interface OrdenCompraDoc {
  numero: string
  anio: number
  secuencial: number
  estado: EstadoOrdenCompra
  proveedorId: string
  proveedorNombre: string
  proveedorCuit: string
  proveedorCondicionIva?: CondicionIva
  ubicacionDestinoId: string
  fechaEmision: Timestamp
  fechaEntregaEstimada: string
  moneda: MonedaCompra
  tipoCambio?: number
  plazoPagoDias: number
  condicionPago: string
  subtotalNeto: number
  montoIva: number
  montoPercepciones: number
  total: number
  items: OrdenCompraLinea[]
  observaciones?: string
  historialEstados: CambioEstadoOrdenCompra[]
  creadoPorUid: string
  creadoPorNombre: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
  enviadoAprobacionEn?: Timestamp
  enviadoAprobacionPorUid?: string
  aprobadoPorUid?: string
  aprobadoPorNombre?: string
  aprobadoEn?: Timestamp
  rechazadoPorUid?: string
  rechazadoEn?: Timestamp
  motivoRechazo?: string
  canceladoPorUid?: string
  canceladoEn?: Timestamp
  motivoCancelacion?: string
  movimientosIngresoIds: string[]
  recepcionCompleta: boolean
  deudaGenerada?: boolean
  /** @deprecated Preferir facturasAsociadasIds (facturación parcial). */
  facturaProveedorId?: string
  /** true cuando existe al menos una factura de proveedor asociada. */
  facturaCargada?: boolean
  /** IDs en `facturas_proveedores` vinculados a esta OC. */
  facturasAsociadasIds?: string[]
  /** Suma de totales de facturas activas asociadas a esta OC. */
  montoFacturadoAcumulado?: number
  /** Requisición interna (`solicitudes_mercaderia`) que originó esta compra, si aplica. */
  solicitudMercaderiaId?: string
}

export interface OrdenCompra extends OrdenCompraDoc {
  id: string
}

export interface ContadorNumeracionOc {
  anio: number
  ultimoSecuencial: number
  actualizadoEn: Timestamp
}

// ─── Recepción OC → Depósito ───────────────────────────────────────────────

export interface LineaRecepcionOcInput {
  lineaId: string
  insumoId: string
  cantidadRecibida: number
  lote?: string
  fechaVencimiento?: string
  temperatura?: string
  controlCalidadOk: boolean
  /** Si se omite, se toma de la línea de la OC. */
  precioUnitarioFacturado?: number
}

export interface RegistrarRecepcionOcEnIngresoInput {
  ordenCompraId: string
  fecha: Date
  tipoDocumento: TipoDocumentoRecepcion
  numeroDocumento: string
  lineas: LineaRecepcionOcInput[]
  usuarioUid: string
  usuarioNombre: string
  observaciones?: string
}

export interface ResultadoRecepcionOcEnIngreso {
  movimientoId: string
  ordenCompraEstado: EstadoOrdenCompra
  ordenCompraNumero: string
}
