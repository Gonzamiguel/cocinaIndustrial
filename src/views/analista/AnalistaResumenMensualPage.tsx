import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  agregarGastoEgresoPorDestino,
  agregarPorRubroSubrubro,
  agregarPorTipoMovimiento,
  buildFilasMovimientoAnalista,
  buildResumenLogisticaDesdeFilas,
  filasMovimientoDelMes,
  formatCantidadAnalista,
  formatFechaAnalista,
  formatMonedaAnalista,
} from '../../lib/analista'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  subscribeMovimientosInventario,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  buildFilasAuditoriaCostoRecetas,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'

function mesActualInputValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseMesInput(value: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2]) - 1
  if (mes < 0 || mes > 11 || !Number.isFinite(anio)) return null
  return { anio, mes }
}

function exportarResumenMensualExcel(
  periodoLabel: string,
  anio: number,
  mes: number,
  filasMes: ReturnType<typeof buildFilasMovimientoAnalista>,
  porRubro: ReturnType<typeof agregarPorRubroSubrubro>,
  porDestino: ReturnType<typeof agregarGastoEgresoPorDestino>,
  porTipo: ReturnType<typeof agregarPorTipoMovimiento>,
  logistica: ReturnType<typeof buildResumenLogisticaDesdeFilas>,
  auditoriaRecetas: ReturnType<typeof buildFilasAuditoriaCostoRecetas>,
) {
  const wb = XLSX.utils.book_new()

  const meta = [{ Periodo: periodoLabel, Generado: new Date().toISOString() }]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Periodo')

  const detalle = filasMes.map((row) => ({
    Fecha: formatFechaAnalista(row.fecha),
    Tipo: row.tipo,
    Documento: row.numeroDocumento,
    Insumo: row.insumo,
    Rubro: row.rubro,
    Subrubro: row.subrubro,
    Cantidad: row.cantidad,
    Unidad: row.unidad,
    Destino: row.destino,
    'Costo Unitario': row.costoUnitario,
    Subtotal: row.subtotal,
    Chofer: row.chofer,
    Patente: row.patente,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Mensaje: 'Sin movimientos en el mes' }]),
    'Detalle mes',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      porRubro.map((r) => ({
        Rubro: r.rubro,
        Subrubro: r.subrubro,
        'Items (líneas)': r.movimientosItems,
        Subtotal: r.subtotal,
      })),
    ),
    'Por rubro',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      porDestino.map((r) => ({
        Destino: r.destino,
        'Líneas egreso': r.items,
        Subtotal: r.subtotal,
      })),
    ),
    'Gasto destino',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      porTipo.map((r) => ({
        Tipo: r.tipo,
        'Líneas': r.items,
        Subtotal: r.subtotal,
      })),
    ),
    'Por tipo mov',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      logistica.map((r) => ({
        Patente: r.patente,
        Chofer: r.chofer,
        Viajes: r.viajes,
        'Kilos (solo unidad Kg)': r.kilosTotales,
        'Valor movilizado': r.valorTotal,
      })),
    ),
    'Logistica mes',
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      auditoriaRecetas.map((r) => ({
        Receta: r.nombre,
        'Costo teorico': r.costoTeorico,
        'Ultima actualizacion precio insumo': r.ultimaActualizacionPrecio
          ? r.ultimaActualizacionPrecio.toISOString()
          : '',
      })),
    ),
    'Costos recetas actual',
  )

  XLSX.writeFile(wb, `Analista_resumen_mensual_${anio}-${String(mes + 1).padStart(2, '0')}.xlsx`)
}

export function AnalistaResumenMensualPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [mesInput, setMesInput] = useState(mesActualInputValue)

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeRecetario(setRecetas), [])
  useEffect(() => subscribeMovimientosInventario(setMovimientos), [])

  const parsed = parseMesInput(mesInput)

  const filas = useMemo(
    () => buildFilasMovimientoAnalista(movimientos, insumos),
    [movimientos, insumos],
  )

  const filasMes = useMemo(
    () => (parsed ? filasMovimientoDelMes(filas, parsed.anio, parsed.mes) : []),
    [filas, parsed],
  )

  const porRubro = useMemo(() => agregarPorRubroSubrubro(filasMes), [filasMes])
  const porDestino = useMemo(() => agregarGastoEgresoPorDestino(filasMes), [filasMes])
  const porTipo = useMemo(() => agregarPorTipoMovimiento(filasMes), [filasMes])
  const logistica = useMemo(() => buildResumenLogisticaDesdeFilas(filasMes), [filasMes])
  const auditoriaRecetas = useMemo(
    () => buildFilasAuditoriaCostoRecetas(insumos, recetas),
    [insumos, recetas],
  )

  const totalMes = useMemo(
    () => filasMes.reduce((acc, f) => acc + f.subtotal, 0),
    [filasMes],
  )

  const periodoLabel = parsed
    ? `${String(parsed.mes + 1).padStart(2, '0')}/${parsed.anio}`
    : '—'

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Resumen mensual exportable
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Totales del mes por rubro, destino, tipo de movimiento y logística; incluye hoja con
              costos teóricos de recetas al momento de la exportación.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-[#8997A6]">
              Mes calendario
              <input
                type="month"
                value={mesInput}
                onChange={(e) => setMesInput(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/25"
              />
            </label>
            <button
              type="button"
              disabled={!parsed}
              onClick={() => {
                if (!parsed) return
                exportarResumenMensualExcel(
                  periodoLabel,
                  parsed.anio,
                  parsed.mes,
                  filasMes,
                  porRubro,
                  porDestino,
                  porTipo,
                  logistica,
                  auditoriaRecetas,
                )
              }}
              className="rounded-lg bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exportar Excel
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#8997A6]">Periodo</p>
          <p className="mt-1 text-2xl font-bold text-[#171717]">{periodoLabel}</p>
          <p className="mt-2 text-sm text-[#8997A6]">
            {filasMes.length.toLocaleString('es-AR')} líneas de movimiento en el mes · Subtotal
            acumulado {formatMonedaAnalista(totalMes)}
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-[#171717]">Por rubro / subrubro</h2>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <tr>
                    <th className="px-3 py-2">Rubro</th>
                    <th className="px-3 py-2">Subrubro</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {porRubro.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-[#8997A6]">
                        Sin datos en el mes.
                      </td>
                    </tr>
                  ) : (
                    porRubro.slice(0, 12).map((r) => (
                      <tr key={`${r.rubro}-${r.subrubro}`}>
                        <td className="px-3 py-2">{r.rubro}</td>
                        <td className="px-3 py-2">{r.subrubro}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMonedaAnalista(r.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-[#171717]">Gasto por destino (egresos)</h2>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <tr>
                    <th className="px-3 py-2">Destino</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {porDestino.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-8 text-center text-[#8997A6]">
                        Sin egresos en el mes.
                      </td>
                    </tr>
                  ) : (
                    porDestino.slice(0, 12).map((r) => (
                      <tr key={r.destino}>
                        <td className="px-3 py-2">{r.destino}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMonedaAnalista(r.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-[#171717]">Por tipo de movimiento</h2>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Líneas</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {porTipo.map((r) => (
                    <tr key={r.tipo}>
                      <td className="px-3 py-2">{r.tipo}</td>
                      <td className="px-3 py-2 text-right">{r.items.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMonedaAnalista(r.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-[#171717]">Logística del mes</h2>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                Kilos solo si la unidad base es Kg (igual que estadística logística).
              </p>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[360px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <tr>
                    <th className="px-3 py-2">Patente</th>
                    <th className="px-3 py-2">Chofer</th>
                    <th className="px-3 py-2 text-right">Viajes</th>
                    <th className="px-3 py-2 text-right">Kg</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logistica.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-[#8997A6]">
                        Sin egresos con transporte en el mes.
                      </td>
                    </tr>
                  ) : (
                    logistica.slice(0, 10).map((r) => (
                      <tr key={r.key}>
                        <td className="px-3 py-2 font-medium">{r.patente}</td>
                        <td className="px-3 py-2">{r.chofer}</td>
                        <td className="px-3 py-2 text-right">{r.viajes.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right">
                          {formatCantidadAnalista(r.kilosTotales)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMonedaAnalista(r.valorTotal)}
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
    </div>
  )
}
