import {
  estiloBadgeEstadoOc,
  etiquetaEstadoOc,
} from '../../lib/comprasUi'
import type { EstadoOrdenCompra } from '../../types/compras'

export function EstadoOcBadge({ estado }: { estado: EstadoOrdenCompra }) {
  const estilo = estiloBadgeEstadoOc(estado)
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={estilo}
    >
      {etiquetaEstadoOc(estado)}
    </span>
  )
}
