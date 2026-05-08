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

export type DiaLaboralSemana = {
  /** Fecha local (mediodía para reducir problemas de zona horaria). */
  fecha: Date
  /** Texto único para UI y Firebase, ej. "Lunes 11/05/2026". */
  fechaConsumo: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
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
 * Lunes de la semana local que contiene `referencia` (00:00 local).
 */
export function getLunesDeSemana(referencia: Date): Date {
  const x = new Date(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate(),
    12,
    0,
    0,
    0,
  )
  const day = x.getDay()
  const offsetDesdeLunes = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + offsetDesdeLunes)
  return x
}

/**
 * Próxima semana laborable = lunes a viernes de la semana calendario **siguiente**
 * a la semana actual (siempre 5 días).
 */
export function getProximaSemanaLaborable(
  ahora: Date = new Date(),
): DiaLaboralSemana[] {
  const lunesEstaSemana = getLunesDeSemana(ahora)
  const lunesProximaSemana = new Date(lunesEstaSemana)
  lunesProximaSemana.setDate(lunesProximaSemana.getDate() + 7)

  const resultado: DiaLaboralSemana[] = []
  for (let i = 0; i < 5; i++) {
    const fecha = new Date(lunesProximaSemana)
    fecha.setDate(fecha.getDate() + i)
    resultado.push({
      fecha,
      fechaConsumo: formatFechaConsumoLabel(fecha),
    })
  }
  return resultado
}
