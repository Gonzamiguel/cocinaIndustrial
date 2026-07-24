import type { MenuItem, MenuStockLote } from './menu'
import { loteKeyMenu } from './despachosViandas'
import { pareceCodigoLoteProduccion } from './produccionLotes'
import type { PayloadQrProduccion } from './qrProduccion'

export type LoteStockViandaEncontrado = {
  menuItem: MenuItem
  lote: MenuStockLote
  loteKey: string
}

function normalizarCodigoVianda(raw: string): string {
  return raw.trim().toUpperCase()
}

export function pareceCodigoTrazabilidadVianda(raw: string): boolean {
  return pareceCodigoLoteProduccion(raw)
}

export function buscarLoteViandaPorCodigoTrazabilidad(
  menuItems: MenuItem[],
  codigoRaw: string,
): LoteStockViandaEncontrado | null {
  const codigo = normalizarCodigoVianda(codigoRaw)
  if (!codigo) return null

  for (const menuItem of menuItems) {
    for (const lote of menuItem.stockLotes ?? []) {
      if (lote.cantidad <= 0) continue
      if (normalizarCodigoVianda(lote.codigoTrazabilidad) === codigo) {
        return { menuItem, lote, loteKey: loteKeyMenu(lote) }
      }
    }
  }
  return null
}

export function buscarLoteViandaPorPayloadQr(
  menuItems: MenuItem[],
  payload: PayloadQrProduccion,
): LoteStockViandaEncontrado | null {
  const porCodigo = buscarLoteViandaPorCodigoTrazabilidad(
    menuItems,
    payload.codigoTrazabilidad,
  )
  if (porCodigo) return porCodigo

  const menuId = payload.menuItemId?.trim()
  if (menuId) {
    const menuItem = menuItems.find((m) => m.id === menuId)
    if (menuItem) {
      for (const lote of menuItem.stockLotes ?? []) {
        if (lote.cantidad <= 0) continue
        if (
          lote.lote === payload.lote.trim() &&
          lote.fechaVencimiento === payload.fechaVencimiento.trim()
        ) {
          return { menuItem, lote, loteKey: loteKeyMenu(lote) }
        }
      }
    }
  }

  for (const menuItem of menuItems) {
    for (const lote of menuItem.stockLotes ?? []) {
      if (lote.cantidad <= 0) continue
      if (
        lote.lote === payload.lote.trim() &&
        lote.fechaVencimiento === payload.fechaVencimiento.trim()
      ) {
        return { menuItem, lote, loteKey: loteKeyMenu(lote) }
      }
    }
  }

  return null
}
