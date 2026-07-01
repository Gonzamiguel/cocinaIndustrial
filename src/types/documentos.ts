import type { Timestamp } from 'firebase/firestore'

/** Entidad de negocio a la que se adjunta un comprobante escaneado. */
export type EntidadTipoDocumento =
  | 'ORDEN_COMPRA'
  | 'FACTURA_PROVEEDOR'
  | 'ORDEN_PAGO'
  | 'PROVEEDOR'

/** Clasificación del archivo dentro del expediente. */
export type TipoComprobanteDocumento =
  | 'FACTURA'
  | 'REMITO'
  | 'COMPROBANTE_PAGO'
  | 'LISTA_PRECIOS'
  | 'OTRO'

/** Documento Firestore en `documentos_adjuntos/{id}`. */
export interface DocumentoAdjuntoDoc {
  entidadId: string
  entidadTipo: EntidadTipoDocumento
  tipoComprobante: TipoComprobanteDocumento
  /** URL pública o firmada de Firebase Storage. */
  url: string
  nombreArchivo: string
  subidoPorUid: string
  subidoPorNombre?: string
  fechaSubida: Timestamp
  /** Ruta en Firebase Storage para borrado directo (opcional). */
  storagePath?: string
  mimeType?: string
  tamanoBytes?: number
  /** Denormalizado para consultas del legajo / expediente. */
  ordenCompraId?: string
  proveedorId?: string
}

export interface DocumentoAdjunto extends DocumentoAdjuntoDoc {
  id: string
}
