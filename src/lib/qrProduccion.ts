import {
  fechaVencimientoDesdeElaboracion,
  generarCodigoLoteGranel,
  generarCodigoLoteVianda,
  normalizarCodigoCorto,
  type ModalidadProduccion,
} from './produccionLotes'

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

/**
 * Genera código de trazabilidad V- / G- para producción.
 * Requiere códigos cortos numéricos (01, 02…), no nombres.
 */
export function generarCodigoTrazabilidadProduccion(input: {
  modalidad: ModalidadProduccion
  codigoPlato: string
  codigoGuarnicion?: string | null
  pesoKg?: number
  fechaElaboracion: string
  fechaVencimiento?: string
}): string {
  const elab = input.fechaElaboracion.trim()
  const vto =
    input.fechaVencimiento?.trim() || fechaVencimientoDesdeElaboracion(elab)
  if (input.modalidad === 'granel') {
    return generarCodigoLoteGranel({
      codigoAlimento: input.codigoPlato,
      pesoKg: input.pesoKg ?? 0,
      fechaElaboracion: elab,
      fechaVencimiento: vto,
    })
  }
  return generarCodigoLoteVianda({
    codigoPlato: input.codigoPlato,
    codigoGuarnicion: input.codigoGuarnicion,
    fechaElaboracion: elab,
    fechaVencimiento: vto,
  })
}

/**
 * @deprecated Usar `generarCodigoTrazabilidadProduccion` con codigoCorto.
 */
export function generarCodigoTrazabilidad(
  _recetaId: string,
  codigoOLote: string,
  fechaVencimiento: string,
  elaboracionYYYYMMDD?: string,
): string {
  const elab =
    elaboracionYYYYMMDD?.trim() ||
    (() => {
      const d = new Date()
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
  const vto =
    fechaVencimiento.trim() || fechaVencimientoDesdeElaboracion(elab)
  const codigo = normalizarCodigoCorto(codigoOLote) || '00'
  return generarCodigoLoteVianda({
    codigoPlato: codigo,
    codigoGuarnicion: null,
    fechaElaboracion: elab,
    fechaVencimiento: vto,
  })
}
