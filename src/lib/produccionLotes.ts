/** Prefijos de lote de producción terminada (cocina central). */
export const PREFIJO_LOTE_VIANDA = 'V-'
export const PREFIJO_LOTE_GRANEL = 'G-'
/** Legacy: producciones anteriores al esquema V-/G-. */
export const PREFIJO_LOTE_LEGACY = 'PT-'

export const DIAS_VENCIMIENTO_PRODUCCION = 60

export type ModalidadProduccion = 'vianda' | 'granel'

function yyyymmddFromInputDate(yyyyMmDd: string): string {
  return yyyyMmDd.trim().replace(/-/g, '')
}

/**
 * Suma exactamente `dias` calendario a una fecha `YYYY-MM-DD` (local).
 */
export function sumarDiasFechaInput(yyyyMmDd: string, dias: number): string {
  const t = yyyyMmDd.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (Number.isNaN(dt.getTime())) return ''
  dt.setDate(dt.getDate() + dias)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function fechaVencimientoDesdeElaboracion(
  elaboracionYYYYMMDD: string,
): string {
  return sumarDiasFechaInput(elaboracionYYYYMMDD, DIAS_VENCIMIENTO_PRODUCCION)
}

/**
 * Código corto de plato/guarnición: solo dígitos, padding a 2 (ej. `1` → `01`).
 * Si no hay dígitos válidos, retorna `''`.
 */
export function normalizarCodigoCorto(raw: string | null | undefined): string {
  const digits = String(raw ?? '')
    .trim()
    .replace(/\D/g, '')
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n > 99) return String(Math.min(99, n)).padStart(2, '0')
  return String(n).padStart(2, '0')
}

/** Próximo código libre `01`…`99` entre los ya usados. */
export function siguienteCodigoCortoDisponible(
  usados: Iterable<string | null | undefined>,
): string {
  const ocupados = new Set<number>()
  for (const u of usados) {
    const c = normalizarCodigoCorto(u)
    if (!c) continue
    ocupados.add(Number(c))
  }
  for (let i = 1; i <= 99; i++) {
    if (!ocupados.has(i)) return String(i).padStart(2, '0')
  }
  return '99'
}

/**
 * Resuelve el código corto de un plato/guarnición:
 * menu → receta → siguiente libre.
 */
export function resolverCodigoCorto(input: {
  codigoMenu?: string | null
  codigoReceta?: string | null
  usados: Iterable<string | null | undefined>
}): string {
  return (
    normalizarCodigoCorto(input.codigoMenu) ||
    normalizarCodigoCorto(input.codigoReceta) ||
    siguienteCodigoCortoDisponible(input.usados)
  )
}

function formatoPesoKgCodigo(pesoKg: number): string {
  const n = Number(pesoKg)
  if (!Number.isFinite(n) || n <= 0) return '0'
  const rounded = Math.round(n * 100) / 100
  return String(rounded).replace('.', 'p')
}

/**
 * Vianda: `V-{plato}{guarnicion}{YYYYMMDD_elab}{YYYYMMDD_vto}`
 * Guarnición ausente → `XX`.
 */
export function generarCodigoLoteVianda(input: {
  codigoPlato: string
  codigoGuarnicion?: string | null
  fechaElaboracion: string
  fechaVencimiento: string
}): string {
  const plato = normalizarCodigoCorto(input.codigoPlato) || '00'
  const guarnRaw = input.codigoGuarnicion?.trim()
  const guarn = guarnRaw
    ? normalizarCodigoCorto(guarnRaw) || 'XX'
    : 'XX'
  const elab = yyyymmddFromInputDate(input.fechaElaboracion)
  const vto = yyyymmddFromInputDate(input.fechaVencimiento)
  return `${PREFIJO_LOTE_VIANDA}${plato}${guarn}${elab}${vto}`
}

/**
 * Granel: `G-{codigo}-{peso}-{YYYYMMDD_elab}{YYYYMMDD_vto}`
 */
export function generarCodigoLoteGranel(input: {
  codigoAlimento: string
  pesoKg: number
  fechaElaboracion: string
  fechaVencimiento: string
}): string {
  const alimento = normalizarCodigoCorto(input.codigoAlimento) || '00'
  const peso = formatoPesoKgCodigo(input.pesoKg)
  const elab = yyyymmddFromInputDate(input.fechaElaboracion)
  const vto = yyyymmddFromInputDate(input.fechaVencimiento)
  return `${PREFIJO_LOTE_GRANEL}${alimento}-${peso}-${elab}${vto}`
}

export function pareceCodigoLoteProduccion(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (s.startsWith('QR-PROD|')) return false
  const u = s.toUpperCase()
  return (
    u.startsWith(PREFIJO_LOTE_VIANDA) ||
    u.startsWith(PREFIJO_LOTE_GRANEL) ||
    u.startsWith(PREFIJO_LOTE_LEGACY)
  )
}

/** @deprecated Preferí normalizarCodigoCorto / generarCodigoLote*. */
export function slugCodigoAlimento(nombre: string, maxLen = 4): string {
  const asCodigo = normalizarCodigoCorto(nombre)
  if (asCodigo) return asCodigo
  const raw = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
  if (!raw) return 'XXXX'.slice(0, Math.max(1, maxLen))
  return raw.slice(0, Math.max(1, maxLen))
}
