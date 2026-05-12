/**
 * Estado de navegación para precargar un egreso desde una solicitud de mercadería.
 * @see DepositoMovimientosPage
 */
export type EgresoPrefillDesdeSolicitud = {
  solicitudId: string
  /** Etiqueta de destino de egreso (p. ej. «Cocina Central»). */
  destinoEgreso: string
  /** Código de ubicación destino (COCINA, CASPOSO, …) */
  ubicacionDestino: string
  items: { insumoId: string; nombreSnapshot: string; cantidad: number }[]
}
