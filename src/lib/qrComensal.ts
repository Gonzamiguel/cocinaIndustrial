const PREFIX_PADRON = 'QR-PADRON|'
const PREFIX_COMEDOR = 'QR-COMEDOR|'

/**
 * Extrae un DNI normalizado desde el texto leído por el escáner.
 * Soporta: DNI plano, `QR-PADRON|DNI`, `QR-COMEDOR|DNI`, JSON con campo `dni`.
 */
export function extraerDniDesdeQr(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null

  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as { dni?: unknown }
      if (typeof o.dni === 'string' && o.dni.trim()) {
        return normalizarDni(o.dni)
      }
    } catch {
      /* no es JSON válido */
    }
  }

  if (t.startsWith(PREFIX_PADRON) || t.startsWith(PREFIX_COMEDOR)) {
    const rest = t.includes('|') ? t.slice(t.indexOf('|') + 1) : ''
    const dni = rest.split('|')[0]?.trim()
    return dni ? normalizarDni(dni) : null
  }

  const soloAlfanumerico = t.replace(/[^a-zA-Z0-9]/g, '')
  if (soloAlfanumerico.length >= 6 && soloAlfanumerico.length <= 12) {
    return normalizarDni(soloAlfanumerico)
  }

  if (/^\d{6,12}$/.test(t.replace(/\D/g, ''))) {
    return normalizarDni(t.replace(/\D/g, ''))
  }

  return normalizarDni(t) || null
}

function normalizarDni(s: string): string | null {
  const d = s.trim().toUpperCase().replace(/\s/g, '')
  return d.length >= 6 ? d : null
}
