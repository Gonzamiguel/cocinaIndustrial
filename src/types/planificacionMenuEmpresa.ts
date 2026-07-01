export type EstadoPlanificacionMenuEmpresa = 'BORRADOR' | 'PUBLICADA' | 'CERRADA'

export interface PlanificacionOpcionMenu {
  menuId: string
  nombre: string
}

export interface PlanificacionDiaMenuEmpresa {
  /** YYYY-MM-DD */
  fechaYmd: string
  /** Etiqueta legible, ej. "Lunes 30/06/2026" */
  fechaConsumo: string
  /** Opciones de plato principal que el empleado puede elegir ese día. */
  opcionesPrincipales: PlanificacionOpcionMenu[]
  /** Opciones de guarnición (si el principal elegido las acepta). */
  opcionesGuarniciones: PlanificacionOpcionMenu[]
  observaciones?: string
}

export interface PlanificacionMenuEmpresa {
  id: string
  empresaId: string
  empresaNombre: string
  empresaCuit?: string
  semanaInicioYmd: string
  semanaFinYmd: string
  dias: PlanificacionDiaMenuEmpresa[]
  estado: EstadoPlanificacionMenuEmpresa
  tokenPublico: string | null
  mensajeEmpresa?: string
  lugarEntregaSugerido?: string
  creadoPorUid: string
  creadoPorNombre: string
  creadoEn: Date | null
  actualizadoEn: Date | null
  publicadoEn: Date | null
}
