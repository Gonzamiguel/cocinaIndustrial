import type { Timestamp } from 'firebase/firestore'

/** Estados del ciclo de una liquidación a contratista. */
export type EstadoLiquidacionContratista = 'BORRADOR' | 'EMITIDA' | 'ANULADA'

/**
 * Conceptos facturables agrupados en el detalle de liquidación.
 * Alineados con la clasificación operativa de comedor y hotelería.
 */
export type ConceptoLiquidacion =
  | 'DESAYUNO'
  | 'MERIENDA'
  | 'VIANDA'
  | 'ALMUERZO'
  | 'REFRIGERIO_ALMUERZO'
  | 'CENA'
  | 'CENA_NOCHERO'
  | 'NOCHE'

/** Precios unitarios netos por concepto (ARS). Se pasa al motor desde la UI o contrato. */
export interface ListaPreciosContratista {
  netoPorConcepto: Partial<Record<ConceptoLiquidacion, number>>
  /** Alícuota IVA sobre el subtotal neto. Default 21. */
  alicuotaIvaPct?: number
}

/** Línea resumida embebida en la liquidación (ej. «150 Desayunos a $X»). */
export interface DetalleLiquidacionContratista {
  concepto: ConceptoLiquidacion
  descripcion: string
  cantidad: number
  precioUnitarioNeto: number
  subtotalNeto: number
}

/** Documento `liquidaciones_contratistas/{id}`. */
export interface LiquidacionContratistaDoc {
  numero: string
  anio: number
  secuencial: number
  empresaId: string
  empresaNombre: string
  empresaCuit: string
  /** Rango inclusive YYYY-MM-DD. */
  fechaInicio: string
  fechaFin: string
  /** Cantidad de viandas (MERIENDA marcada como vianda). */
  totalViandas: number
  totalNoches: number
  detalles: DetalleLiquidacionContratista[]
  subtotalNeto: number
  montoIva: number
  totalFacturado: number
  estado: EstadoLiquidacionContratista
  /** IDs bloqueados al emitir (auditoría / reintentos de batch). */
  registrosComedorIds: string[]
  historialPernocteIds: string[]
  observaciones?: string
  creadoPorUid: string
  creadoPorNombre: string
  creadoEn: Timestamp
  emitidoEn?: Timestamp
  actualizadoEn?: Timestamp
  anuladoPorUid?: string
  anuladoEn?: Timestamp
  motivoAnulacion?: string
}

export interface LiquidacionContratista extends LiquidacionContratistaDoc {
  id: string
}

/** Preview en memoria (sin persistir). Sin número hasta emitir. */
export type PreviewLiquidacionContratista = Omit<
  LiquidacionContratistaDoc,
  'creadoEn' | 'creadoPorUid' | 'creadoPorNombre' | 'numero' | 'anio' | 'secuencial'
> & {
  id?: string
  numero?: string
  anio?: number
  secuencial?: number
}

export interface ContadorNumeracionLiq {
  anio: number
  ultimoSecuencial: number
  actualizadoEn: Timestamp
}

export interface EmitirLiquidacionInput {
  empresaId: string
  fechaInicio: string
  fechaFin: string
  listaPrecios: ListaPreciosContratista
  usuarioUid: string
  usuarioNombre: string
  observaciones?: string
}

export interface EmitirLiquidacionResult {
  liquidacionId: string
  numero: string
  totalFacturado: number
  registrosMarcados: number
  pernoctesMarcados: number
  saldoCuentaCorrienteContratista: number
}

export interface AnularLiquidacionInput {
  liquidacionId: string
  usuarioUid: string
  usuarioNombre: string
  motivoAnulacion?: string
}

export interface AnularLiquidacionResult {
  liquidacionId: string
  numero: string
  totalRevertido: number
  consumosDesbloqueados: number
  saldoCuentaCorrienteContratista: number
}

/** Conceptos principales en el asistente de nueva liquidación. */
export const CONCEPTOS_WIZARD_LIQUIDACION = [
  'DESAYUNO',
  'ALMUERZO',
  'CENA',
  'NOCHE',
  'VIANDA',
] as const satisfies readonly ConceptoLiquidacion[]
