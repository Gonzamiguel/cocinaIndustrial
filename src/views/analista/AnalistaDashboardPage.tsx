import { useEffect, useMemo, useState } from 'react'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  subscribeMovimientosInventario,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  buildFilasMovimientoAnalista,
  calcularCapitalInmovilizadoAnalista,
  calcularGastoMensualPorDestino,
  formatMonedaAnalista,
} from '../../lib/analista'

function KpiCard({
  title,
  value,
  help,
}: {
  title: string
  value: string
  help: string
}) {
  return (
    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
        {title}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-[#171717]">{value}</p>
      <p className="mt-2 text-sm text-[#8997A6]">{help}</p>
    </article>
  )
}

export function AnalistaDashboardPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeMovimientosInventario(setMovimientos), [])

  const filas = useMemo(
    () => buildFilasMovimientoAnalista(movimientos, insumos),
    [movimientos, insumos],
  )

  const capitalInmovilizado = useMemo(
    () => calcularCapitalInmovilizadoAnalista(movimientos, insumos),
    [movimientos, insumos],
  )

  const gastoMensualPorDestino = useMemo(
    () => calcularGastoMensualPorDestino(filas),
    [filas],
  )

  const gastoMensualTotal = useMemo(
    () => gastoMensualPorDestino.reduce((acc, item) => acc + item.total, 0),
    [gastoMensualPorDestino],
  )

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Dashboard ejecutivo
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Vista consolidada de stock valorizado y gasto mensual por destino.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="grid gap-4 lg:grid-cols-2">
          <KpiCard
            title="Capital inmovilizado total"
            value={formatMonedaAnalista(capitalInmovilizado)}
            help="Valorización total del stock positivo con costo vigente del catálogo."
          />
          <KpiCard
            title="Gasto mensual total"
            value={formatMonedaAnalista(gastoMensualTotal)}
            help="Suma de egresos valorizados del mes actual, agrupables por destino."
          />
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-[#CD1818]">
              Gasto mensual por destino
            </h2>
            <p className="mt-1 text-xs text-[#8997A6]">
              Distribución de la mercadería egresada valorizada durante el mes en curso.
            </p>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3 text-right">Total mensual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gastoMensualPorDestino.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-12 text-center text-[#8997A6]">
                      No hay egresos valorizados en el mes actual.
                    </td>
                  </tr>
                ) : (
                  gastoMensualPorDestino.map((item) => (
                    <tr key={item.destino}>
                      <td className="px-4 py-3 font-medium text-[#171717]">
                        {item.destino}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#171717]">
                        {formatMonedaAnalista(item.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
