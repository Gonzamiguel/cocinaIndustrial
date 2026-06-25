import { Link } from 'react-router-dom'
import type { DespachoViandaRegistro } from '../../lib/despachosViandas'
import { formatFechaVencimiento, obtenerEstadoVencimiento } from '../../lib/vencimientoLote'

type Props = {
  remito: DespachoViandaRegistro | null
  onClose: () => void
  onDescargarPdf: (remito: DespachoViandaRegistro) => void
}

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ModalDespachoRemitoDetalle({ remito, onClose, onDescargarPdf }: Props) {
  if (!remito) return null

  const totalViandas = remito.items.reduce((acc, it) => acc + it.cantidadTotal, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-remito-titulo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="shrink-0 border-b border-gray-100 px-5 py-4">
          <p id="modal-remito-titulo" className="text-lg font-semibold text-[#171717]">
            Remito {remito.numeroRemito}
          </p>
          <p className="mt-1 text-sm text-[#8997A6]">
            {remito.empresa} · {formatFechaHora(remito.fecha)} · {totalViandas} viandas
          </p>
          {remito.lugarEntrega ? (
            <p className="mt-0.5 text-xs text-[#8997A6]">Entrega: {remito.lugarEntrega}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {remito.items.map((it) => (
            <div key={it.menuItemId} className="mb-4 last:mb-0">
              <p className="font-semibold text-[#171717]">
                {it.nombrePlato}{' '}
                <span className="font-normal text-[#8997A6]">× {it.cantidadTotal}</span>
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase text-[#8997A6]">
                      <th className="px-3 py-2">Lote</th>
                      <th className="px-3 py-2">Vencimiento</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {it.lotes.map((l, idx) => {
                      const estado = obtenerEstadoVencimiento(l.fechaVencimiento)
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-mono text-xs">{l.lote}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${estado.className}`}
                            >
                              {formatFechaVencimiento(l.fechaVencimiento)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.cantidad}</td>
                          <td className="px-3 py-2 text-right">
                            {l.produccionId ? (
                              <Link
                                to={`/admin/trazabilidad?produccionId=${encodeURIComponent(l.produccionId)}`}
                                className="text-xs font-semibold text-[#CD1818] hover:underline"
                                onClick={onClose}
                              >
                                Trazabilidad
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {remito.observaciones ? (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-[#171717]">
              <span className="font-semibold">Observaciones: </span>
              {remito.observaciones}
            </p>
          ) : null}

          {remito.pedidoIds.length > 0 ? (
            <p className="mt-3 text-xs text-[#8997A6]">
              Pedidos vinculados: {remito.pedidoIds.length} (marcados como despachados)
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#171717] hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => onDescargarPdf(remito)}
            className="rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
          >
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
