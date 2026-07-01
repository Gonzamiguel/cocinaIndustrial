import type { MenuItem, PedidoDelDia } from './menu'
import { sugerirAsignacionFifo } from './despachosViandas'
import {
  empresaLabelPedido,
  etiquetaCortaFechaConsumo,
  ordenFechaConsumo,
} from './adminPedidosUi'

export type ItemRemitoDesdePedidos = {
  menuItemId: string
  nombrePlato: string
  cantidadTotal: number
}

/** Estado de navegación Pedidos del día → Despacho. */
export type DespachoDesdePedidosState = {
  empresa: string
  fechaConsumo: string
  pedidoIds: string[]
  items: ItemRemitoDesdePedidos[]
}

function resolverMenuId(
  pedido: PedidoDelDia,
  tipo: 'principal' | 'guarnicion',
  menuPorNombre: Map<string, MenuItem>,
): { menuItemId: string; nombre: string } | null {
  const menuId =
    tipo === 'principal' ? pedido.principalMenuId : pedido.guarnicionMenuId
  const nombre = tipo === 'principal' ? pedido.platoPrincipal : pedido.guarnicion
  if (!nombre || nombre === '—') return null
  if (menuId?.trim()) return { menuItemId: menuId.trim(), nombre }
  const porNombre = menuPorNombre.get(nombre.trim().toLowerCase())
  if (porNombre) return { menuItemId: porNombre.id, nombre: porNombre.nombre }
  return null
}

/** Agrupa pedidos filtrados en líneas de remito por ítem de menú. */
export function resumenMenuItemsParaDespacho(
  pedidos: PedidoDelDia[],
  menuItems: MenuItem[],
): ItemRemitoDesdePedidos[] {
  const menuPorNombre = new Map(
    menuItems.map((m) => [m.nombre.trim().toLowerCase(), m] as const),
  )
  const map = new Map<string, ItemRemitoDesdePedidos>()

  for (const p of pedidos) {
    for (const tipo of ['principal', 'guarnicion'] as const) {
      const resolved = resolverMenuId(p, tipo, menuPorNombre)
      if (!resolved) continue
      const prev = map.get(resolved.menuItemId)
      if (prev) {
        prev.cantidadTotal += 1
      } else {
        map.set(resolved.menuItemId, {
          menuItemId: resolved.menuItemId,
          nombrePlato: resolved.nombre,
          cantidadTotal: 1,
        })
      }
    }
  }

  return [...map.values()].sort((a, b) =>
    a.nombrePlato.localeCompare(b.nombrePlato, 'es'),
  )
}

const RE_FECHA_CONSUMO = /(\d{2})\/(\d{2})\/(\d{4})/

/** Convierte etiqueta "Lunes 11/05/2026" → input date yyyy-mm-dd. */
export function fechaConsumoAInputDate(fechaConsumo: string): string | null {
  const m = fechaConsumo.match(RE_FECHA_CONSUMO)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

export type LineaRemitoDesdePedidos = {
  menuItemId: string
  cantidadTotal: number
  lotesQty: Record<string, string>
}

export interface OpcionDiaConsumoEmpresa {
  fechaConsumo: string
  labelCorto: string
  cantidad: number
}

export function pedidosActivosEmpresaDia(
  pedidos: PedidoDelDia[],
  empresaNombre: string,
  fechaConsumo: string,
): PedidoDelDia[] {
  const emp = empresaNombre.trim().toLowerCase()
  const dia = fechaConsumo.trim()
  if (!emp || !dia) return []
  return pedidos.filter(
    (p) =>
      empresaLabelPedido(p).toLowerCase() === emp && p.fechaConsumo?.trim() === dia,
  )
}

export function opcionesDiaConsumoEmpresa(
  pedidos: PedidoDelDia[],
  empresaNombre: string,
): OpcionDiaConsumoEmpresa[] {
  const emp = empresaNombre.trim().toLowerCase()
  if (!emp) return []
  const map = new Map<string, number>()
  for (const p of pedidos) {
    if (empresaLabelPedido(p).toLowerCase() !== emp) continue
    const fc = p.fechaConsumo?.trim()
    if (!fc) continue
    map.set(fc, (map.get(fc) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([fechaConsumo, cantidad]) => ({
      fechaConsumo,
      labelCorto: etiquetaCortaFechaConsumo(fechaConsumo),
      cantidad,
    }))
    .sort((a, b) => ordenFechaConsumo(a.fechaConsumo) - ordenFechaConsumo(b.fechaConsumo))
}

/** Agrupa pedidos en líneas de remito con lotes FIFO sugeridos. */
export function construirRemitoDesdePedidos(
  pedidos: PedidoDelDia[],
  menuItems: MenuItem[],
): {
  items: ItemRemitoDesdePedidos[]
  pedidoIds: string[]
  lineas: LineaRemitoDesdePedidos[]
} {
  const items = resumenMenuItemsParaDespacho(pedidos, menuItems)
  const menuPorId = new Map(menuItems.map((m) => [m.id, m] as const))
  const lineas: LineaRemitoDesdePedidos[] = items.map((item) => {
    const menu = menuPorId.get(item.menuItemId)
    const lotesQty = menu
      ? sugerirAsignacionFifo(menu.stockLotes ?? [], item.cantidadTotal)
      : {}
    return {
      menuItemId: item.menuItemId,
      cantidadTotal: item.cantidadTotal,
      lotesQty,
    }
  })
  return {
    items,
    pedidoIds: pedidos.map((p) => p.id),
    lineas,
  }
}

export function nuevaKeyFilaDespacho(menuItemId = ''): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${menuItemId}-${Date.now()}-${Math.random()}`
}
