/** Servicio de comida según franja horaria local. */
export type ServicioComedor =
  | 'DESAYUNO'
  | 'ALMUERZO'
  | 'MERIENDA'
  | 'CENA'
  | 'CENA_NOCHERO'
  | 'FUERA DE HORARIO'

/** Valor fijo de `usuarioRegistro` para altas manuales desde el dashboard de campamento. */
export const USUARIO_REGISTRO_SUPERVISOR_MANUAL = 'Carga Manual Supervisor'

/** Servicios que puede forzar el guardia cuando el reloj marca fuera de franja. */
export const SERVICIOS_COMEDOR_FORZABLES: ServicioComedor[] = [
  'DESAYUNO',
  'ALMUERZO',
  'MERIENDA',
  'CENA',
  'CENA_NOCHERO',
]

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
  /** Motivo o nota (p. ej. carga manual desde dashboard). */
  observaciones?: string
  /** true cuando ya fue incluido en una liquidación EMITIDA. */
  liquidado?: boolean
  /** ID en `liquidaciones_contratistas`. */
  liquidacionId?: string
}
