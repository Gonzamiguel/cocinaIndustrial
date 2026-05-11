import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import { buildFilasAuditoriaCostoRecetas, subscribeRecetario, type RecetaTecnica } from '../../lib/recetario'

function formatMoneda(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatFecha(value: Date | null): string {
  if (!value) return 'Sin actualización'
  return value.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AnalistaCostosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeRecetario(setRecetas), [])

  const filas = useMemo(
    () => buildFilasAuditoriaCostoRecetas(insumos, recetas),
    [insumos, recetas],
  )

  function exportarExcel() {
    const dataset = filas.map((fila) => ({
      Receta: fila.nombre,
      'Costo teorico': fila.costoTeorico,
      'Ultima actualizacion precio insumo': fila.ultimaActualizacionPrecio
        ? fila.ultimaActualizacionPrecio.toISOString()
        : '',
    }))
    const ws = XLSX.utils.json_to_sheet(dataset.length ? dataset : [{ Mensaje: 'Sin recetas' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria costos')
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    XLSX.writeFile(
      wb,
      `Analista_auditoria_costos_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.xlsx`,
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Auditoría de costos gastro
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Costo teórico actualizado por receta a partir del precio actual de los insumos vinculados.
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
              {filas.length.toLocaleString('es-AR')} recetas auditadas
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Nombre receta</th>
                  <th className="px-4 py-3 text-right">Costo teórico</th>
                  <th className="px-4 py-3">Última actualización de precio de insumo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center text-[#8997A6]">
                      No hay recetas disponibles para auditar.
                    </td>
                  </tr>
                ) : (
                  filas.map((fila) => (
                    <tr key={fila.recetaId}>
                      <td className="px-4 py-3 font-medium text-[#171717]">
                        {fila.nombre}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#171717]">
                        {formatMoneda(fila.costoTeorico)}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">
                        {formatFecha(fila.ultimaActualizacionPrecio)}
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
