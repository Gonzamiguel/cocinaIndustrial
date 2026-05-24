/** Estados operativos de una cama en hotelería / campamento. */
export type EstadoCama = 'LIBRE' | 'OCUPADA' | 'SUCIA' | 'MANTENIMIENTO'

/** Persona registrada en el padrón (huésped / trabajador alojado). */
export interface PadronPersona {
  id: string
  dni: string
  nombre: string
  apellido: string
  empresa: string
  creadoEn: Date | null
}

/** Cama física o litera en habitación. */
export interface Cama {
  id: string
  sector: string
  habitacion: string
  denominacion: string
  estado: EstadoCama
  personaId?: string | null
  fechaCheckIn?: Date | null
  /** Id del registro en `historial_pernoctes` con check-out pendiente (si aplica). */
  historialAbiertoId?: string | null
  /** Denormalizado al check-in: "Apellido, Nombre" (padrón). */
  ocupanteNombre?: string | null
  /** Denormalizado al check-in: empresa del padrón. */
  ocupanteEmpresa?: string | null
  /** Planificación: fecha estimada de salida (no ejecuta check-out). */
  fechaSalidaEstimada?: Date | null
  /** Última limpieza registrada (denormalizado para consulta rápida). */
  ultimoResponsableLimpieza?: string | null
  ultimaFechaLimpieza?: Date | null
}

/** Registro auditable de limpieza de una cama (estado SUCIA → LIBRE). */
export interface HistorialLimpieza {
  id: string
  camaId: string
  sector: string
  habitacion: string
  responsableLimpieza: string
  fechaLimpieza: Date | null
}

/** Registro de pernocte (una estadía; puede cerrarse o seguir abierta). */
export interface HistorialPernocte {
  id: string
  personaId: string
  camaId: string
  empresa: string
  fechaCheckIn: Date | null
  fechaCheckOut: Date | null
  /** Mientras el pernocte está abierto: salida prevista (opcional). */
  fechaSalidaEstimada?: Date | null
}

export interface FilaImportPadron {
  dni: string
  nombre: string
  apellido: string
  empresa: string
}

/** Fila normalizada para carga masiva (Excel/CSV → batch por DNI). */
export interface FilaCargaMasivaPadron {
  dni: string
  nombre: string
  apellido: string
  nombreCompleto: string
  empresa: string
  legajo?: string
  posicion?: string
  sector?: string
  estado: string
}
