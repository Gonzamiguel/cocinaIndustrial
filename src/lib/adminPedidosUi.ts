import type { PedidoDelDia } from './menu'

export const FILTRO_EMPRESA_TODAS = '__todas__'
export const FILTRO_DIA_TODOS = '__todos__'
export const FILTRO_DIA_SIN_FECHA = '__sin_fecha__'

const RE_FECHA_CONSUMO = /(\d{2})\/(\d{2})\/(\d{4})/

/** Orden cronológico para etiquetas tipo "Lunes 11/05/2026". */
export function ordenFechaConsumo(fechaConsumo: string): number {
  const m = fechaConsumo.match(RE_FECHA_CONSUMO)
  if (!m) return Number.MAX_SAFE_INTEGER
  const [, dd, mm, yyyy] = m
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0, 0).getTime()
}

export function etiquetaCortaFechaConsumo(fechaConsumo: string): string {
  const m = fechaConsumo.match(RE_FECHA_CONSUMO)
  if (!m) return fechaConsumo
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0, 0)
  const abbr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()]
  return `${abbr} ${dd}/${mm}`
}

export function claveDiaPedido(p: PedidoDelDia): string {
  const fc = p.fechaConsumo?.trim()
  if (fc) return fc
  return FILTRO_DIA_SIN_FECHA
}

export interface OpcionFiltroDia {
  clave: string
  label: string
  labelCorto: string
  cantidad: number
}

export function opcionesFiltroDia(pedidos: PedidoDelDia[]): OpcionFiltroDia[] {
  const map = new Map<string, OpcionFiltroDia>()
  for (const p of pedidos) {
    const clave = claveDiaPedido(p)
    const label =
      clave === FILTRO_DIA_SIN_FECHA ? 'Sin día de consumo' : clave
    const prev = map.get(clave)
    if (prev) {
      prev.cantidad += 1
    } else {
      map.set(clave, {
        clave,
        label,
        labelCorto:
          clave === FILTRO_DIA_SIN_FECHA ? 'Sin día' : etiquetaCortaFechaConsumo(clave),
        cantidad: 1,
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.clave === FILTRO_DIA_SIN_FECHA) return 1
    if (b.clave === FILTRO_DIA_SIN_FECHA) return -1
    return ordenFechaConsumo(a.clave) - ordenFechaConsumo(b.clave)
  })
}

export function filtrarPedidosPorDia(
  pedidos: PedidoDelDia[],
  filtroClave: string,
): PedidoDelDia[] {
  if (filtroClave === FILTRO_DIA_TODOS) return pedidos
  return pedidos.filter((p) => claveDiaPedido(p) === filtroClave)
}

export function empresaLabelPedido(p: PedidoDelDia): string {
  if (p.empresaNombre?.trim()) return p.empresaNombre.trim()
  if (p.lugarEntrega && p.lugarEntrega !== '—') return p.lugarEntrega.trim()
  return 'Sin empresa'
}

export function claveEmpresaPedido(p: PedidoDelDia): string {
  if (p.empresaId?.trim()) return p.empresaId.trim()
  return `nombre:${empresaLabelPedido(p).toLowerCase()}`
}

export interface OpcionFiltroEmpresa {
  clave: string
  label: string
  cantidad: number
}

export function opcionesFiltroEmpresa(pedidos: PedidoDelDia[]): OpcionFiltroEmpresa[] {
  const map = new Map<string, OpcionFiltroEmpresa>()
  for (const p of pedidos) {
    const clave = claveEmpresaPedido(p)
    const label = empresaLabelPedido(p)
    const prev = map.get(clave)
    if (prev) {
      prev.cantidad += 1
    } else {
      map.set(clave, { clave, label, cantidad: 1 })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }),
  )
}

export function filtrarPedidosPorEmpresa(
  pedidos: PedidoDelDia[],
  filtroClave: string,
): PedidoDelDia[] {
  if (filtroClave === FILTRO_EMPRESA_TODAS) return pedidos
  return pedidos.filter((p) => claveEmpresaPedido(p) === filtroClave)
}

export function filtrarPedidosAdmin(
  pedidos: PedidoDelDia[],
  filtroDia: string,
  filtroEmpresa: string,
): PedidoDelDia[] {
  return filtrarPedidosPorEmpresa(filtrarPedidosPorDia(pedidos, filtroDia), filtroEmpresa)
}

export function resumenCantidadesPlatos(pedidos: PedidoDelDia[]): {
  principales: [string, number][]
  guarniciones: [string, number][]
} {
  const principales = new Map<string, number>()
  const guarniciones = new Map<string, number>()

  for (const p of pedidos) {
    if (p.platoPrincipal && p.platoPrincipal !== '—') {
      principales.set(
        p.platoPrincipal,
        (principales.get(p.platoPrincipal) ?? 0) + 1,
      )
    }
    if (p.guarnicion && p.guarnicion !== '—') {
      guarniciones.set(p.guarnicion, (guarniciones.get(p.guarnicion) ?? 0) + 1)
    }
  }

  return {
    principales: [...principales.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'es'),
    ),
    guarniciones: [...guarniciones.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'es'),
    ),
  }
}

export function resumenPorEmpresa(
  pedidos: PedidoDelDia[],
): { label: string; clave: string; pedidos: number; principales: number; guarniciones: number }[] {
  const grupos = new Map<
    string,
    { label: string; clave: string; pedidos: number; principales: number; guarniciones: number }
  >()

  for (const p of pedidos) {
    const clave = claveEmpresaPedido(p)
    const label = empresaLabelPedido(p)
    const g = grupos.get(clave) ?? { label, clave, pedidos: 0, principales: 0, guarniciones: 0 }
    g.pedidos += 1
    if (p.platoPrincipal && p.platoPrincipal !== '—') g.principales += 1
    if (p.guarnicion && p.guarnicion !== '—') g.guarniciones += 1
    grupos.set(clave, g)
  }

  return [...grupos.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }),
  )
}
