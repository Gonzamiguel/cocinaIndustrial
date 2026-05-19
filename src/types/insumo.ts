import type { UnidadBaseInsumo } from '../lib/insumos'

/** Empaque alternativo respecto a la unidad base del insumo (Kg, Lt, Un). */
export interface PresentacionInsumo {
  id: string
  /** Ej: "Caja x20", "Bidón 5L" */
  nombre: string
  /** Cuántas unidades base representa una unidad de este empaque. */
  factorMultiplicador: number
}

export interface InsumoCatalogo {
  id: string
  nombreGenerico: string
  marca: string
  rubro: string
  subrubro: string
  /** Descripción comercial del envase de referencia (catálogo). */
  presentacion: string
  unidadBase: UnidadBaseInsumo
  contenidoNeto: number
  costoEnvase: number
  costoPorUnidadBase: number
  presentaciones?: PresentacionInsumo[]
  creadoEn: Date | null
  actualizadoEn: Date | null
}
