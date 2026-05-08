/** Abreviaturas para pestañas (índice = getDay()). */
const NOMBRE_DIA_CORTO = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
] as const

/** Nombres de día en español (índice = getDay(): 0 domingo … 6 sábado). */
const NOMBRE_DIA_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

export const DIAS_VENTANA_CONSUMO = 7

export type DiaConsumo = {
  /** Fecha local (mediodía para reducir problemas de zona horaria). */
  fecha: Date
  /** Texto único para UI y Firebase, ej. "Lunes 11/05/2026". */
  fechaConsumo: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function crearFechaLocalSegura(referencia: Date): Date {
  return new Date(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate(),
    12,
    0,
    0,
    0,
  )
}

/**
 * Etiqueta legible para un día: "Martes 07/05/2026".
 */
export function formatFechaConsumoLabel(d: Date): string {
  const nombre = NOMBRE_DIA_ES[d.getDay()]
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  return `${nombre} ${dd}/${mm}/${yyyy}`
}

/** Etiqueta corta para pestañas, ej. "Lun 11". */
export function formatEtiquetaPestaña(fecha: Date): string {
  const abbr = NOMBRE_DIA_CORTO[fecha.getDay()]
  return `${abbr} ${fecha.getDate()}`
}

/**
 * Ventana rodante de consumo desde hoy: 7 días consecutivos, incluidos fines
 * de semana.
 */
export function getVentanaRodanteConsumo(
  ahora: Date = new Date(),
  cantidadDias: number = DIAS_VENTANA_CONSUMO,
): DiaConsumo[] {
  const inicio = crearFechaLocalSegura(ahora)
  const total = Math.max(0, Math.trunc(cantidadDias))
  const resultado: DiaConsumo[] = []

  for (let i = 0; i < total; i++) {
    const fecha = new Date(inicio)
    fecha.setDate(inicio.getDate() + i)
    resultado.push({
      fecha,
      fechaConsumo: formatFechaConsumoLabel(fecha),
    })
  }

  return resultado
}
