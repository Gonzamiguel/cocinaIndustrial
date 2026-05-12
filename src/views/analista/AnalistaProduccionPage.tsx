import { useEffect, useMemo, useState } from 'react'
import { Factory } from 'lucide-react'
import {
  subscribeProduccionCocinaRegistros,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'

function formatFecha(value: Date | null): string {
  if (!value) return '—'
  return value.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatArs(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AnalistaProduccionPage() {
  const [rows, setRows] = useState<ProduccionCocinaRegistro[]>([])

  useEffect(() => subscribeProduccionCocinaRegistros(setRows, 800), [])

  const ordenadas = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = a.fecha?.getTime() ?? 0
        const tb = b.fecha?.getTime() ?? 0
        return tb - ta
      }),
    [rows],
  )

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex items-center gap-2">
          <Factory className="h-6 w-6 shrink-0 text-[#CD1818]" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Eficiencia de receta
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Costo teórico (receta y precios de insumo) frente al costo real según lo declarado en
              cocina al registrar la producción.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[min(75vh,900px)] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6] shadow-sm">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Plato / producto</th>
                  <th className="px-4 py-3 text-right">Costo teórico (ARS)</th>
                  <th className="px-4 py-3 text-right">Costo real (ARS)</th>
                  <th className="px-4 py-3 text-right">% desvío</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordenadas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-[#8997A6]">
                      Aún no hay registros de producción en cocina central.
                    </td>
                  </tr>
                ) : (
                  ordenadas.map((r) => {
                    const absDesv = Math.abs(r.desvioPorcentaje)
                    const alerta = absDesv > 5
                    return (
                      <tr
                        key={r.id}
                        className={alerta ? 'bg-red-50/90' : 'hover:bg-gray-50/80'}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                          {formatFecha(r.fecha)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#171717]">{r.nombreProducto}</p>
                          <p className="text-xs text-[#8997A6]">
                            {r.recetaNombre} · {r.cantidadPorciones} porc.
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                          {formatArs(r.costoTeorico)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                          {formatArs(r.costoReal)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums font-semibold ${
                            alerta ? 'text-red-800' : 'text-[#171717]'
                          }`}
                        >
                          {r.desvioPorcentaje.toLocaleString('es-AR', {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#8997A6]">
          Filas con fondo rojizo: desvío absoluto mayor al 5 % respecto del costo teórico.
        </p>
      </div>
    </div>
  )
}
