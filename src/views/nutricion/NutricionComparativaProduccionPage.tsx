import { useEffect, useMemo, useState } from 'react'
import { formatMonedaAnalista } from '../../lib/analista'
import {
  subscribeProduccionCocinaRegistros,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'

function formatFecha(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NutricionComparativaProduccionPage() {
  const [produccion, setProduccion] = useState<ProduccionCocinaRegistro[]>([])
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  useEffect(() => subscribeProduccionCocinaRegistros(setProduccion, 200), [])

  const filas = useMemo(
    () => [...produccion].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)),
    [produccion],
  )

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#CD1818]">
          Ficha técnica vs producción real
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        {filas.length === 0 ? (
          <p className="text-sm text-[#8997A6]">Todavía no hay producciones registradas.</p>
        ) : (
          <div className="space-y-4">
            {filas.map((reg) => {
              const abierto = expandidoId === reg.id
              const alerta = Math.abs(reg.desvioPorcentaje) > 5
              return (
                <article
                  key={reg.id}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                    alerta ? 'border-red-200' : 'border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandidoId(abierto ? null : reg.id)}
                    className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-[#171717]">{reg.nombreProducto}</p>
                      <p className="mt-0.5 text-xs text-[#8997A6]">
                        Ficha: {reg.recetaNombre} · {reg.cantidadPorciones} viandas · Lote{' '}
                        {reg.loteProducto || '—'} · Vto {reg.fechaVencimiento || '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#8997A6]">{formatFecha(reg.fecha)}</p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span>
                        Teórico:{' '}
                        <strong>{formatMonedaAnalista(reg.costoTeorico)}</strong>
                      </span>
                      <span>
                        Real: <strong>{formatMonedaAnalista(reg.costoReal)}</strong>
                      </span>
                      <span className={alerta ? 'font-semibold text-red-600' : ''}>
                        Desvío: {reg.desvioPorcentaje.toFixed(1)}%
                      </span>
                    </div>
                  </button>

                  {abierto ? (
                    <div className="border-t border-gray-100 px-4 py-4">
                      {reg.itemsDetalle.length === 0 ? (
                        <p className="text-sm text-[#8997A6]">
                          Sin detalle de insumos en este registro (producción anterior).
                        </p>
                      ) : (
                        <table className="w-full min-w-[560px] border-collapse text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase text-[#8997A6]">
                              <th className="pb-2 pr-3">Insumo</th>
                              <th className="pb-2 pr-3 text-right">Según ficha</th>
                              <th className="pb-2 pr-3 text-right">Usó cocina</th>
                              <th className="pb-2 text-right">Desvío</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {reg.itemsDetalle.map((item, idx) => {
                              const desvio =
                                item.cantidadTeorica > 0
                                  ? ((item.cantidadReal - item.cantidadTeorica) /
                                      item.cantidadTeorica) *
                                    100
                                  : item.cantidadReal > 0
                                    ? 100
                                    : null
                              return (
                                <tr key={`${item.insumoId}-${idx}`}>
                                  <td className="py-2 pr-3">
                                    {item.nombre}
                                    {item.unidad ? (
                                      <span className="text-xs text-[#8997A6]"> ({item.unidad})</span>
                                    ) : null}
                                  </td>
                                  <td className="py-2 pr-3 text-right tabular-nums text-[#8997A6]">
                                    {item.cantidadTeorica.toLocaleString('es-AR', {
                                      maximumFractionDigits: 4,
                                    })}
                                  </td>
                                  <td className="py-2 pr-3 text-right tabular-nums font-medium">
                                    {item.cantidadReal > 0
                                      ? item.cantidadReal.toLocaleString('es-AR', {
                                          maximumFractionDigits: 4,
                                        })
                                      : '—'}
                                  </td>
                                  <td
                                    className={`py-2 text-right tabular-nums text-xs font-semibold ${
                                      desvio !== null && Math.abs(desvio) > 5
                                        ? 'text-red-600'
                                        : 'text-[#8997A6]'
                                    }`}
                                  >
                                    {desvio !== null
                                      ? `${desvio >= 0 ? '+' : ''}${desvio.toFixed(1)}%`
                                      : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
