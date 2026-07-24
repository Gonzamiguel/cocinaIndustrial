import type { Insumo } from './insumos'
import { formatLabelInsumo } from './insumos'
import type { ItemSolicitudMercaderia } from './solicitudesMercaderia'
import type { RecetaTecnica } from './recetario'

export type IngredienteEscaladoReceta = {
  insumoId: string | null
  producto: string
  cantidad: number
  unidadMedida: string
  presentacion: string
  observacion: string
}

/**
 * Escala ingredientes de la ficha técnica a `porcionesObjetivo`.
 * Misma fórmula que producción: bruto × (1 + merma%) × (porciones / rendimiento).
 */
export function escalarIngredientesReceta(
  receta: RecetaTecnica,
  porcionesObjetivo: number,
  insumoPorId?: Map<string, Insumo>,
): IngredienteEscaladoReceta[] {
  const rend = Math.max(1, Math.floor(receta.rendimientoPorciones) || 1)
  const p = Number(porcionesObjetivo)
  const factor = Number.isFinite(p) && p > 0 ? p / rend : 0
  const notaPlan = `Planificado: ${receta.nombre} x ${Math.floor(p) || 0} porciones`

  const out: IngredienteEscaladoReceta[] = []

  for (const ing of receta.ingredientes) {
    const id = ing.insumoId?.trim() || null
    const teorico =
      ing.cantidadBruta * (1 + Math.max(0, ing.porcentajeMerma) / 100) * factor
    const cantidad = Math.round(teorico * 10000) / 10000
    if (!(cantidad > 0)) continue

    const ins = id && insumoPorId ? insumoPorId.get(id) : undefined
    const producto = ins
      ? formatLabelInsumo(ins)
      : ing.ingrediente.trim() || '—'

    const sinVinculo = !id
      ? 'Sin vínculo a catálogo depósito'
      : ''

    out.push({
      insumoId: id,
      producto,
      cantidad,
      unidadMedida: ing.unidad,
      presentacion: ins?.presentacion?.trim() ?? '',
      observacion: [notaPlan, sinVinculo].filter(Boolean).join(' · '),
    })
  }

  return out.sort((a, b) =>
    a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }),
  )
}

export function itemsSolicitudDesdeRecetaEscalada(
  escalados: IngredienteEscaladoReceta[],
): ItemSolicitudMercaderia[] {
  return escalados.map((e) => ({
    producto: e.producto,
    cantidad: e.cantidad,
    unidadMedida: e.unidadMedida,
    presentacion: e.presentacion,
    observacion: e.observacion,
    ...(e.insumoId ? { insumoId: e.insumoId } : {}),
  }))
}
