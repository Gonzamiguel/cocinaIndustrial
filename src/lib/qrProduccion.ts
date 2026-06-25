/** Prefijo QR etiquetas de plato terminado (cocina industrial). */
export const QR_PROD_PREFIX = 'QR-PROD|'

export type PayloadQrProduccion = {
  codigoTrazabilidad: string
  recetaId: string
  recetaNombre: string
  lote: string
  fechaVencimiento: string
  menuItemId?: string
}

export function buildProduccionQrPayload(input: PayloadQrProduccion): string {
  const codigo = input.codigoTrazabilidad.trim()
  const recetaId = input.recetaId.trim()
  const lote = input.lote.trim()
  const vto = input.fechaVencimiento.trim()
  const nombre = input.recetaNombre.trim().replace(/\|/g, '/')
  const menuId = input.menuItemId?.trim() ?? ''
  return `${QR_PROD_PREFIX}${codigo}|${recetaId}|${lote}|${vto}|${nombre}|${menuId}`
}

export function parseProduccionQrPayload(raw: string): PayloadQrProduccion | null {
  const s = raw.trim()
  if (!s.startsWith(QR_PROD_PREFIX)) return null
  const parts = s.slice(QR_PROD_PREFIX.length).split('|')
  if (parts.length < 5) return null
  const [codigoTrazabilidad, recetaId, lote, fechaVencimiento, recetaNombre, menuItemId] = parts
  if (!codigoTrazabilidad?.trim() || !recetaId?.trim() || !lote?.trim()) return null
  return {
    codigoTrazabilidad: codigoTrazabilidad.trim(),
    recetaId: recetaId.trim(),
    lote: lote.trim(),
    fechaVencimiento: (fechaVencimiento ?? '').trim(),
    recetaNombre: (recetaNombre ?? '').trim(),
    menuItemId: menuItemId?.trim() || undefined,
  }
}

export function generarCodigoTrazabilidad(
  recetaId: string,
  lote: string,
  fechaVencimiento: string,
): string {
  const loteSlug = lote.replace(/[^\w-]+/g, '').slice(0, 14).toUpperCase()
  const vtoSlug = fechaVencimiento.replace(/-/g, '')
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PT-${recetaId.slice(0, 6).toUpperCase()}-${loteSlug || 'SINLOTE'}-${vtoSlug}-${rnd}`
}
