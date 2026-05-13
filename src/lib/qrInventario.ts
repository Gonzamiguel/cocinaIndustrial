/** Prefijo de códigos QR de trazabilidad interna (depósito). */
export const QR_INV_PREFIX = 'QR-INV|'

/**
 * Construye el payload del QR: `QR-INV|{insumoId}|{lote}`.
 * El segmento de lote puede estar vacío (sin número de lote).
 */
export function buildInventarioQrPayload(insumoId: string, lote: string): string {
  const id = insumoId.trim()
  const lt = typeof lote === 'string' ? lote : ''
  return `${QR_INV_PREFIX}${id}|${lt}`
}

/**
 * Parsea un buffer escaneado. Devuelve null si el formato no coincide.
 */
export function parseInventarioQrPayload(raw: string): {
  insumoId: string
  lote: string
} | null {
  const s = raw.trim()
  if (!s.startsWith(QR_INV_PREFIX)) return null
  const rest = s.slice(QR_INV_PREFIX.length)
  const i = rest.indexOf('|')
  if (i < 0) return null
  const insumoId = rest.slice(0, i).trim()
  if (!insumoId) return null
  return { insumoId, lote: rest.slice(i + 1) }
}
