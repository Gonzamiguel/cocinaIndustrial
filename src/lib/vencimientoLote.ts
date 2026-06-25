export type NivelAlertaVencimiento = 'vencido' | 'critico' | 'proximo' | 'ok' | 'sin'

export function formatFechaVencimiento(value: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export function diasHastaVencimiento(fechaIso: string): number | null {
  if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const vto = new Date(fechaIso + 'T12:00:00')
  return Math.ceil((vto.getTime() - hoy.getTime()) / 86400000)
}

export function obtenerEstadoVencimiento(fechaIso: string): {
  label: string
  nivel: NivelAlertaVencimiento
  className: string
} {
  const dias = diasHastaVencimiento(fechaIso)
  if (dias === null) {
    return {
      label: 'Sin vto',
      nivel: 'sin',
      className: 'bg-gray-100 text-gray-600 ring-gray-200',
    }
  }
  if (dias < 0) {
    return {
      label: 'Vencido',
      nivel: 'vencido',
      className: 'bg-red-100 text-red-800 ring-red-200',
    }
  }
  if (dias <= 2) {
    return {
      label: 'Crítico',
      nivel: 'critico',
      className: 'bg-amber-100 text-amber-900 ring-amber-200',
    }
  }
  if (dias <= 7) {
    return {
      label: 'Próximo',
      nivel: 'proximo',
      className: 'bg-yellow-50 text-yellow-900 ring-yellow-200',
    }
  }
  return {
    label: 'OK',
    nivel: 'ok',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }
}

export function esAlertaVencimiento(nivel: NivelAlertaVencimiento): boolean {
  return nivel === 'vencido' || nivel === 'critico' || nivel === 'proximo'
}
