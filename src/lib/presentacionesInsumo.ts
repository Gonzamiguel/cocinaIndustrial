import type { PresentacionInsumo } from '../types/insumo'
import type { Insumo, UnidadBaseInsumo } from './insumos'

/** Valor del selector cuando se opera en unidad base (factor 1). */
export const PRESENTACION_BASE_ID = '__unidad_base__'

export type OpcionPresentacionEmpaque = {
  id: string
  label: string
  factor: number
}

export function nuevaPresentacionInsumo(
  parcial?: Partial<PresentacionInsumo>,
): PresentacionInsumo {
  const id =
    parcial?.id?.trim() ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pres_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`)
  return {
    id,
    nombre: parcial?.nombre?.trim() ?? '',
    factorMultiplicador: Number(parcial?.factorMultiplicador) || 0,
  }
}

export function sanitizarPresentacionesInsumo(
  raw: PresentacionInsumo[] | undefined,
): PresentacionInsumo[] {
  if (!raw?.length) return []
  const out: PresentacionInsumo[] = []
  for (const p of raw) {
    const nombre = p.nombre?.trim() ?? ''
    const factor = Number(p.factorMultiplicador)
    if (!nombre || !Number.isFinite(factor) || factor <= 0) continue
    out.push({
      id: p.id?.trim() || nuevaPresentacionInsumo().id,
      nombre,
      factorMultiplicador: factor,
    })
  }
  return out
}

export function opcionesPresentacionEmpaque(
  insumo: Pick<Insumo, 'unidadBase' | 'presentaciones'> | null | undefined,
): OpcionPresentacionEmpaque[] {
  if (!insumo) {
    return [{ id: PRESENTACION_BASE_ID, label: 'Unidad base', factor: 1 }]
  }
  const base: OpcionPresentacionEmpaque = {
    id: PRESENTACION_BASE_ID,
    label: `Unidad base (${insumo.unidadBase})`,
    factor: 1,
  }
  const extras = (insumo.presentaciones ?? []).map((p) => ({
    id: p.id,
    label: p.nombre,
    factor: p.factorMultiplicador,
  }))
  return [base, ...extras]
}

export function factorPresentacionSeleccionada(
  insumo: Pick<Insumo, 'presentaciones'> | null | undefined,
  presentacionId: string,
): number {
  if (!presentacionId || presentacionId === PRESENTACION_BASE_ID) return 1
  const p = insumo?.presentaciones?.find((x) => x.id === presentacionId)
  const f = Number(p?.factorMultiplicador)
  return Number.isFinite(f) && f > 0 ? f : 1
}

export function etiquetaPresentacionSeleccionada(
  insumo: Pick<Insumo, 'unidadBase' | 'presentaciones'> | null | undefined,
  presentacionId: string,
): string {
  if (!presentacionId || presentacionId === PRESENTACION_BASE_ID) {
    return insumo ? `Unidad base (${insumo.unidadBase})` : 'Unidad base'
  }
  return insumo?.presentaciones?.find((x) => x.id === presentacionId)?.nombre ?? 'Empaque'
}

export function convertirCantidadAUnidadBase(
  cantidadIngresada: number,
  factor: number,
): number {
  const c = Number(cantidadIngresada)
  const f = Number(factor)
  if (!Number.isFinite(c) || !Number.isFinite(f) || f <= 0) return 0
  return c * f
}

export function parseCantidadUsuario(value: string): number | null {
  const raw = value.trim().replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function textoConversionUnidadBase(
  cantidadStr: string,
  factor: number,
  unidadBase: UnidadBaseInsumo,
): string | null {
  const cant = parseCantidadUsuario(cantidadStr)
  if (cant == null || factor === 1) return null
  const base = convertirCantidadAUnidadBase(cant, factor)
  return `(= ${base.toLocaleString('es-AR', { maximumFractionDigits: 4 })} ${unidadBase})`
}
