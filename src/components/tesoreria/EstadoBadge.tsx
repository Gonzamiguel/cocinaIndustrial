import {
  estiloBadgeEstadoFactura,
  estiloBadgeEstadoOrdenPago,
  etiquetaEstadoFactura,
  etiquetaEstadoOrdenPago,
} from '../../lib/tesoreriaUi'
import type { EstadoFacturaProveedor, EstadoOrdenPago } from '../../types/tesoreria'

type EstadoBadgeProps =
  | { tipo: 'factura'; estado: EstadoFacturaProveedor }
  | { tipo: 'ordenPago'; estado: EstadoOrdenPago }

export function EstadoBadge(props: EstadoBadgeProps) {
  const estilo =
    props.tipo === 'factura'
      ? estiloBadgeEstadoFactura(props.estado)
      : estiloBadgeEstadoOrdenPago(props.estado)
  const etiqueta =
    props.tipo === 'factura'
      ? etiquetaEstadoFactura(props.estado)
      : etiquetaEstadoOrdenPago(props.estado)

  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={estilo}
    >
      {etiqueta}
    </span>
  )
}
