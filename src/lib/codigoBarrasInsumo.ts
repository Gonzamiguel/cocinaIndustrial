import { formatLabelInsumo, type Insumo } from './insumos'

/** Normaliza EAN/GTIN escaneado (solo dígitos; conserva ceros a la izquierda). */
export function normalizarCodigoBarras(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  return digits || trimmed
}

export function indiceInsumosPorCodigoBarras(insumos: Insumo[]): Map<string, Insumo> {
  const map = new Map<string, Insumo>()
  for (const ins of insumos) {
    const code = ins.codigoBarras?.trim()
    if (!code) continue
    const norm = normalizarCodigoBarras(code)
    if (norm) map.set(norm, ins)
  }
  return map
}

export function buscarInsumoPorCodigoEscaneado(
  insumos: Insumo[],
  raw: string,
): Insumo | null {
  const norm = normalizarCodigoBarras(raw)
  if (!norm) return null
  return indiceInsumosPorCodigoBarras(insumos).get(norm) ?? null
}

/** Devuelve el nombre del otro insumo si el código ya está en uso. */
export function conflictoCodigoBarrasInsumo(
  insumos: Insumo[],
  codigoBarras: string,
  exceptInsumoId?: string | null,
): string | null {
  const norm = normalizarCodigoBarras(codigoBarras)
  if (!norm) return null
  for (const ins of insumos) {
    if (exceptInsumoId && ins.id === exceptInsumoId) continue
    const otro = ins.codigoBarras?.trim()
    if (!otro) continue
    if (normalizarCodigoBarras(otro) === norm) {
      return formatLabelInsumo(ins)
    }
  }
  return null
}

/** ¿Parece un código de barras EAN/GTIN escaneado por pistola 1D? */
export function pareceCodigoBarrasProducto(raw: string): boolean {
  const norm = normalizarCodigoBarras(raw)
  return norm.length >= 6 && norm.length <= 14 && /^\d+$/.test(norm)
}
