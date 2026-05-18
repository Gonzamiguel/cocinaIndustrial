import type { HistorialPernocte, PadronPersona } from '../types/hoteleria'

export function parseYmdLocal(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/**
 * Cuenta noches facturables que caen dentro del rango [desde, hasta] (fechas locales).
 * - Cada noche se asocia al **día calendario de inicio** de esa noche (00:00 local).
 * - El día de check-out no cuenta (salida matutina): solo se cuentan días `d` con `d < día(check-out)`.
 * - Si `fechaCheckOut` es null (en campamento): no cuenta la noche que terminaría el día `hasta`
 *   (p. ej. filtro 10–15, ingreso 12 → noches 12, 13 y 14; el 15 queda fuera hasta check-out real).
 */
export function nochesEnRango(
  fechaCheckIn: Date | null,
  fechaCheckOut: Date | null,
  desdeYmd: string,
  hastaYmd: string,
): number {
  if (!fechaCheckIn) return 0
  const rangeStart = startOfDayLocal(parseYmdLocal(desdeYmd))
  const rangeEnd = startOfDayLocal(parseYmdLocal(hastaYmd))
  const in0 = startOfDayLocal(fechaCheckIn)
  const out0 = fechaCheckOut
    ? startOfDayLocal(fechaCheckOut)
    : rangeEnd

  let n = 0
  for (
    let d = new Date(in0.getTime());
    d < out0;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0)
  ) {
    if (d >= rangeStart && d <= rangeEnd) n++
  }
  return n
}

export type FilaDetallePernocte = {
  historialId: string
  personaId: string
  dni: string
  nombreApellido: string
  empresa: string
  fechaCheckIn: Date | null
  fechaCheckOut: Date | null
  nochesEnFiltro: number
}

/**
 * Una fila por registro de historial con al menos una noche facturable en el rango.
 */
export function filasPernoctesDetalladas(
  historial: HistorialPernocte[],
  padronPorId: Map<string, PadronPersona>,
  desdeYmd: string,
  hastaYmd: string,
): FilaDetallePernocte[] {
  const rows: FilaDetallePernocte[] = []
  for (const h of historial) {
    const n = nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd)
    if (n <= 0) continue
    const p = padronPorId.get(h.personaId)
    const dni = p?.dni?.trim() || '—'
    const nombreApellido = p ? `${p.nombre} ${p.apellido}`.trim() || '—' : '—'
    const empresa = (h.empresa?.trim() || p?.empresa?.trim() || '—') || '—'
    rows.push({
      historialId: h.id,
      personaId: h.personaId,
      dni,
      nombreApellido,
      empresa,
      fechaCheckIn: h.fechaCheckIn,
      fechaCheckOut: h.fechaCheckOut,
      nochesEnFiltro: n,
    })
  }
  rows.sort((a, b) => {
    const ta = a.fechaCheckIn?.getTime() ?? 0
    const tb = b.fechaCheckIn?.getTime() ?? 0
    if (tb !== ta) return tb - ta
    return a.nombreApellido.localeCompare(b.nombreApellido, 'es', { sensitivity: 'base' })
  })
  return rows
}

export function filasReportePorEmpresa(
  historial: HistorialPernocte[],
  desdeYmd: string,
  hastaYmd: string,
): { empresa: string; noches: number }[] {
  const map = new Map<string, number>()
  for (const h of historial) {
    const n = nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd)
    if (n <= 0) continue
    const emp = h.empresa.trim() || '—'
    map.set(emp, (map.get(emp) ?? 0) + n)
  }
  return [...map.entries()]
    .map(([empresa, noches]) => ({ empresa, noches }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'es', { sensitivity: 'base' }))
}
