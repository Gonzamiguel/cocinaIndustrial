import type { ServicioComedor } from '../types/comedor'

/** Minutos desde medianoche (hora local). */
function minutosDesdeMedianoche(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Determina el servicio de comida activo según la hora local.
 * 04:00–09:30 DESAYUNO · 11:30–15:00 ALMUERZO · 16:00–19:00 MERIENDA · 20:00–23:59 CENA.
 */
export function obtenerServicioActual(date: Date = new Date()): ServicioComedor {
  const m = minutosDesdeMedianoche(date)
  if (m >= 4 * 60 && m < 9 * 60 + 30) return 'DESAYUNO'
  if (m >= 11 * 60 + 30 && m < 15 * 60) return 'ALMUERZO'
  if (m >= 16 * 60 && m < 19 * 60) return 'MERIENDA'
  if (m >= 20 * 60 && m <= 23 * 60 + 59) return 'CENA'
  return 'FUERA DE HORARIO'
}

export function servicioComedorActivo(servicio: ServicioComedor): boolean {
  return servicio !== 'FUERA DE HORARIO'
}

/** Modo nochero: el guardia fuerza cena nocturna sin depender del reloj. */
export function resolverServicioParaRegistro(
  modoNochero: boolean,
  date: Date = new Date(),
): ServicioComedor {
  if (modoNochero) return 'CENA_NOCHERO'
  return obtenerServicioActual(date)
}

/** Permite registrar si hay franja horaria activa o el toggle nochero está encendido. */
export function puedeRegistrarComedor(servicioHorario: ServicioComedor, modoNochero: boolean): boolean {
  if (modoNochero) return true
  return servicioComedorActivo(servicioHorario)
}

/** Refrigerio incluido en almuerzo y en cena nochera (roster minero). */
export function contieneRefrigerioPorServicio(servicio: ServicioComedor): boolean {
  return servicio === 'ALMUERZO' || servicio === 'CENA_NOCHERO'
}

export function etiquetaServicioComedor(servicio: ServicioComedor): string {
  switch (servicio) {
    case 'DESAYUNO':
      return 'Desayuno'
    case 'ALMUERZO':
      return 'Almuerzo'
    case 'MERIENDA':
      return 'Merienda'
    case 'CENA':
      return 'Cena'
    case 'CENA_NOCHERO':
      return 'Cena nochera'
    default:
      return 'Fuera de horario'
  }
}
