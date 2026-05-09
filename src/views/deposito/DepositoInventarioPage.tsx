import { useEffect, useMemo, useState } from 'react'
import {
  calcularStockPorInsumo,
  subscribeMovimientosInventario,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'

export function DepositoInventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    return subscribeMovimientosInventario(setMovimientos)
  }, [])

  const stockPorId = useMemo(
    () => calcularStockPorInsumo(movimientos),
    [movimientos],
  )

  const filas = useMemo(() => {
    const sorted = [...insumos].sort((a, b) =>
      formatLabelInsumo(a).localeCompare(formatLabelInsumo(b), 'es', {
        sensitivity: 'base',
      }),
    )
    return sorted.map((ins) => {
      const cat = ins.categoria?.trim()
      const categoriaMostrada =
        cat || (ins.presentacion?.trim() ? ins.presentacion : '—')
      return {
        ins,
        stock: stockPorId.get(ins.id) ?? 0,
        etiqueta: formatLabelInsumo(ins),
        categoriaMostrada,
      }
    })
  }, [insumos, stockPorId])

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Inventario actual
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Stock calculado en tiempo real a partir del catálogo y todos los
          movimientos registrados (Kardex en memoria).
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Posiciones de stock
            </h2>
            <p className="mt-0.5 text-xs text-[#8997A6]">
              Ingresos y ajustes positivos suman; egresos, decomisos y ajustes
              negativos restan.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3 text-right">Stock actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-16 text-center text-[#8997A6]"
                    >
                      No hay insumos en el catálogo todavía.
                    </td>
                  </tr>
                ) : (
                  filas.map(({ ins, stock, etiqueta, categoriaMostrada }) => (
                    <tr key={ins.id} className="hover:bg-neutral-50/80">
                      <td className="px-4 py-3 text-[#171717]">{etiqueta}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-[#171717]">
                        {categoriaMostrada}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                        {ins.unidadBase}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          stock <= 0 ? 'font-semibold text-[#CD1818]' : 'text-[#171717]'
                        }`}
                      >
                        {stock.toLocaleString('es-AR', {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
