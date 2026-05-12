import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  buildFilasMovimientoAnalista,
  buildResumenLogisticaDesdeFilas,
  formatCantidadAnalista,
  formatMonedaAnalista,
} from '../../lib/analista'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  subscribeMovimientosInventario,
  opcionesHistorialAmplio,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'

export function AnalistaLogisticaPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => {
    return subscribeMovimientosInventario(
      setMovimientos,
      opcionesHistorialAmplio(12000),
    )
  }, [])

  const filas = useMemo(
    () => buildFilasMovimientoAnalista(movimientos, insumos),
    [movimientos, insumos],
  )

  const resumen = useMemo(() => buildResumenLogisticaDesdeFilas(filas), [filas])

  function exportarExcel() {
    const dataset = resumen.map((fila) => ({
      Patente: fila.patente,
      Chofer: fila.chofer,
      'Viajes realizados': fila.viajes,
      'Kilos transportados (solo unidad Kg)': fila.kilosTotales,
      'Valor movilizado': fila.valorTotal,
    }))
    const ws = XLSX.utils.json_to_sheet(
      dataset.length ? dataset : [{ Mensaje: 'Sin datos de logistica' }],
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Logistica')
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    XLSX.writeFile(
      wb,
      `Analista_logistica_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.xlsx`,
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Estadística logística
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Consolidado de viajes por chofer y patente sobre egresos con trazabilidad de transporte.
            </p>
          </div>
          <button
            type="button"
            onClick={exportarExcel}
            className="shrink-0 rounded-lg bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414]"
          >
            Exportar Excel
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-[#8997A6]">
              {resumen.length.toLocaleString('es-AR')} combinaciones chofer / patente
            </p>
            <p className="mt-1 text-xs text-[#8997A6]">
              Los kilos totales solo consideran filas con unidad base `Kg`.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Patente</th>
                  <th className="px-4 py-3">Chofer</th>
                  <th className="px-4 py-3 text-right">Viajes realizados</th>
                  <th className="px-4 py-3 text-right">Kilos transportados</th>
                  <th className="px-4 py-3 text-right">Valor movilizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-[#8997A6]">
                      No hay egresos con datos de transporte para resumir.
                    </td>
                  </tr>
                ) : (
                  resumen.map((fila) => (
                    <tr key={fila.key}>
                      <td className="px-4 py-3 font-medium text-[#171717]">
                        {fila.patente}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">{fila.chofer}</td>
                      <td className="px-4 py-3 text-right text-[#171717]">
                        {fila.viajes.toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-right text-[#171717]">
                        {formatCantidadAnalista(fila.kilosTotales)} Kg
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#171717]">
                        {formatMonedaAnalista(fila.valorTotal)}
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
