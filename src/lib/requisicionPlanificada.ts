import type { ItemSolicitudMercaderia } from './solicitudesMercaderia'
import type { Insumo } from './insumos'
import {
  cantidadIngredienteParaPorciones,
  type RecetaTecnica,
} from './recetario'

export type LineaPlanProduccion = {
  key: string
  fechaYmd: string
  recetaId: string
  porciones: number
}

export type ItemExplosionPlanificada = {
  insumoId: string | null
  producto: string
  cantidad: number
  unidadMedida: string
  origen: string[]
}

function redondear4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Gramos de receta → Kg de solicitud (unidad base de depósito). */
export function unidadYCantidadParaSolicitud(
  unidad: string,
  cantidad: number,
): { unidad: string; cantidad: number } {
  if (unidad === 'Gr') {
    return { unidad: 'Kg', cantidad: redondear4(cantidad / 1000) }
  }
  return { unidad, cantidad: redondear4(cantidad) }
}

function claveConsolidado(insumoId: string | null, producto: string, unidad: string): string {
  return `${insumoId ?? ''}|${producto.trim().toLowerCase()}|${unidad}`
}

/**
 * Multiplica ingredientes de cada receta (merma + rendimiento) y consolida
 * por insumo/unidad para armar la solicitud al depósito.
 */
export function consolidarIngredientesPlanificados(
  lineas: LineaPlanProduccion[],
  recetasById: Map<string, RecetaTecnica>,
  insumosById: Map<string, Insumo>,
): ItemExplosionPlanificada[] {
  const acc = new Map<string, ItemExplosionPlanificada>()

  for (const linea of lineas) {
    if (!Number.isFinite(linea.porciones) || linea.porciones <= 0) continue
    const receta = recetasById.get(linea.recetaId)
    if (!receta) continue

    for (const ing of receta.ingredientes) {
      const bruto = cantidadIngredienteParaPorciones(
        ing,
        linea.porciones,
        receta.rendimientoPorciones,
      )
      if (bruto <= 0) continue
      const { unidad, cantidad } = unidadYCantidadParaSolicitud(ing.unidad, bruto)
      if (cantidad <= 0) continue

      const insumoId = ing.insumoId?.trim() || null
      const ins = insumoId ? insumosById.get(insumoId) : undefined
      const producto = ins?.nombreGenerico.trim() || ing.ingrediente.trim() || 'Insumo'
      const key = claveConsolidado(insumoId, producto, unidad)
      const origen = `${receta.nombre} (${linea.porciones} porc. · ${linea.fechaYmd})`
      const prev = acc.get(key)
      if (prev) {
        prev.cantidad = redondear4(prev.cantidad + cantidad)
        prev.origen.push(origen)
      } else {
        acc.set(key, {
          insumoId,
          producto,
          cantidad,
          unidadMedida: unidad,
          origen: [origen],
        })
      }
    }
  }

  return [...acc.values()].sort((a, b) =>
    a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' }),
  )
}

export function itemsSolicitudDesdeExplosion(
  filas: ItemExplosionPlanificada[],
): ItemSolicitudMercaderia[] {
  return filas
    .filter((f) => f.cantidad > 0 && f.producto.trim())
    .map((f) => ({
      producto: f.producto,
      cantidad: f.cantidad,
      unidadMedida: f.unidadMedida,
      presentacion: '—',
      observacion: f.origen.slice(0, 4).join(' · '),
      ...(f.insumoId ? { insumoId: f.insumoId } : {}),
    }))
}
