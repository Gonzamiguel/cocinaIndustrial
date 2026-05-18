/** Servicio de comida según franja horaria local. */
export type ServicioComedor =
  | 'DESAYUNO'
  | 'ALMUERZO'
  | 'MERIENDA'
  | 'CENA'
  | 'CENA_NOCHERO'
  | 'FUERA DE HORARIO'

/** Registro de acceso al comedor (`registros_comedor`). */
export interface RegistroComedor {
  id: string
  dni: string
  nombre: string
  apellido: string
  empresa: string
  servicio: ServicioComedor
  /** Almuerzo y cena nochera incluyen refrigerio para facturación. */
  contieneRefrigerio?: boolean
  /** Fecha local YYYY-MM-DD para consultas offline del contador diario. */
  diaOperativo: string
  fechaHora: Date | null
  usuarioRegistro: string
}
