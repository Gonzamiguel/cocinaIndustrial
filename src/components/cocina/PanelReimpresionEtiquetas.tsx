import { useEffect, useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import {
  subscribeProduccionCocinaRegistros,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'
import {
  etiquetaDataDesdeProduccion,
  type EtiquetaProduccionData,
} from './ModalEtiquetaProduccionCocina'

type PanelReimpresionEtiquetasProps = {
  onAbrir: (data: EtiquetaProduccionData, copias: number) => void
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

export function PanelReimpresionEtiquetas({ onAbrir }: PanelReimpresionEtiquetasProps) {
  const [regs, setRegs] = useState<ProduccionCocinaRegistro[]>([])
  const [q, setQ] = useState('')

  useEffect(() => subscribeProduccionCocinaRegistros(setRegs, 300), [])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return regs
    return regs.filter((r) => {
      const blob = [
        r.loteProducto,
        r.nombreProducto,
        r.recetaNombre,
        r.codigoTrazabilidad,
        r.id,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(term)
    })
  }, [q, regs])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-neutral-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
          Reimprimir etiqueta
        </p>
        <p className="mt-1 text-xs text-[#8997A6]">
          Si se manchó, se despegó o salió mal de la Zebra, buscá el lote y volvé a imprimir. No
          hace falta registrar otra producción.
        </p>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8997A6]" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lote V-0101…, plato o código QR"
            className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
          />
        </label>
      </div>
      {filtrados.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[#8997A6]">
          {regs.length === 0
            ? 'Todavía no hay producciones. Registrá un lote y la etiqueta queda acá para siempre.'
            : 'Ningún lote coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Etiqueta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#171717]">
                    {r.loteProducto || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#171717]">{r.nombreProducto}</span>
                    <span className="mt-0.5 block text-xs text-[#8997A6]">{r.recetaNombre}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[#8997A6]">
                    {formatFechaHora(r.fecha)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {r.cantidadPorciones}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onAbrir(
                          etiquetaDataDesdeProduccion(r),
                          Math.max(1, Math.floor(r.cantidadPorciones) || 1),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#CD1818]/25 bg-[#CD1818]/5 px-2.5 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/10"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
