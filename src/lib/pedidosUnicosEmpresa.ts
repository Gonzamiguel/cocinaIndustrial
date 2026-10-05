import { sanitizarDniInput } from './padronFormInput'

export const COL_PEDIDOS_UNICOS_EMPRESA = 'pedidos_unicos_empresa'

const RE_FECHA_CONSUMO = /(\d{2})\/(\d{2})\/(\d{4})/

/** DNI argentino: 7 a 9 dígitos. */
export function dniPedidoEmpresaValido(dni: string): boolean {
  const d = sanitizarDniInput(dni)
  return d.length >= 7 && d.length <= 9
}

export function ymdDesdeFechaConsumoLabel(fechaConsumo: string): string | null {
  const m = RE_FECHA_CONSUMO.exec(fechaConsumo)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export function ymdCompactoPedido(ymd: string): string {
  return ymd.replace(/-/g, '')
}

/**
 * Id determinístico del lock anti-duplicado:
 * `{planificacionId}_{dni}_{YYYYMMDD}_{ALMUERZO|CENA}`.
 * Almuerzo y cena del mismo día son servicios distintos.
 */
export function idPedidoUnicoEmpresa(
  planificacionId: string,
  dni: string,
  fechaYmd: string,
  servicio?: string,
): string {
  const plan = planificacionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
  const d = sanitizarDniInput(dni)
  const f = ymdCompactoPedido(fechaYmd)
  const srv = (servicio ?? 'ALMUERZO').replace(/[^A-Z]/g, '').slice(0, 16) || 'ALMUERZO'
  return `${plan}_${d}_${f}_${srv}`
}
