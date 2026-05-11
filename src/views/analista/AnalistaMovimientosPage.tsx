import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { subscribeCategorias, type Categoria } from '../../lib/categorias'
import {
  buildFilasMovimientoAnalista,
  fechaIsoLocal,
  formatCantidadAnalista,
  formatFechaAnalista,
  formatMonedaAnalista,
  type FilaMovimientoAnalista,
} from '../../lib/analista'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  subscribeMovimientosInventario,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'

const FILTRO_TODOS = '__todos__'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function exportarDataset(rows: FilaMovimientoAnalista[]) {
  const dataset = rows.map((row) => ({
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

  const ws = XLSX.utils.json_to_sheet(dataset)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dataset movimientos')
  const now = new Date()
  XLSX.writeFile(
    wb,
    `Analista_movimientos_${pad(now.getDate())}-${pad(
      now.getMonth() + 1,
    )}-${now.getFullYear()}.xlsx`,
  )
}

export function AnalistaMovimientosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [rubro, setRubro] = useState(FILTRO_TODOS)
  const [subrubro, setSubrubro] = useState(FILTRO_TODOS)
  const [destino, setDestino] = useState(FILTRO_TODOS)
  const [tipoMovimiento, setTipoMovimiento] = useState(FILTRO_TODOS)

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeCategorias(setCategorias), [])
  useEffect(() => subscribeMovimientosInventario(setMovimientos), [])

  const filas = useMemo(
    () => buildFilasMovimientoAnalista(movimientos, insumos),
    [movimientos, insumos],
  )

  const subrubrosDisponibles = useMemo(() => {
    if (rubro === FILTRO_TODOS) return []
    return (
      categorias.find((categoria) => categoria.nombre === rubro)?.subrubros ?? []
    )
  }, [categorias, rubro])

  const destinosDisponibles = useMemo(
    () =>
      [...new Set(filas.map((fila) => fila.destino).filter((value) => value && value !== '—'))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [filas],
  )

  const filasFiltradas = useMemo(() => {
    return filas.filter((fila) => {
      const fecha = fechaIsoLocal(fila.fecha)
      if (fechaDesde && (!fecha || fecha < fechaDesde)) return false
      if (fechaHasta && (!fecha || fecha > fechaHasta)) return false
      if (rubro !== FILTRO_TODOS && fila.rubro !== rubro) return false
      if (subrubro !== FILTRO_TODOS && fila.subrubro !== subrubro) return false
      if (destino !== FILTRO_TODOS && fila.destino !== destino) return false
      if (tipoMovimiento !== FILTRO_TODOS && fila.tipo !== tipoMovimiento) return false
      return true
    })
  }, [destino, fechaDesde, fechaHasta, filas, rubro, subrubro, tipoMovimiento])

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Reporte maestro de movimientos
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Dataset analítico con una fila por ítem para cruces de costos, logística y consumo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportarDataset(filasFiltradas)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            Exportar dataset
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Desde
              </span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Hasta
              </span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Rubro
              </span>
              <select
                value={rubro}
                onChange={(e) => {
                  setRubro(e.target.value)
                  setSubrubro(FILTRO_TODOS)
                }}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              >
                <option value={FILTRO_TODOS}>Todos</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.nombre}>
                    {categoria.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Subrubro
              </span>
              <select
                value={subrubro}
                onChange={(e) => setSubrubro(e.target.value)}
                disabled={rubro === FILTRO_TODOS}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
              >
                <option value={FILTRO_TODOS}>Todos</option>
                {subrubrosDisponibles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Destino
              </span>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              >
                <option value={FILTRO_TODOS}>Todos</option>
                {destinosDisponibles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Tipo
              </span>
              <select
                value={tipoMovimiento}
                onChange={(e) => setTipoMovimiento(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              >
                <option value={FILTRO_TODOS}>Todos</option>
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
                <option value="DECOMISO">Decomiso</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
            </label>
          </div>
        </section>

        <section className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-[#8997A6]">
              {filasFiltradas.length.toLocaleString('es-AR')} filas visibles
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1440px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3">Rubro</th>
                  <th className="px-4 py-3">Cantidad</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3 text-right">Costo unitario</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3">Chofer</th>
                  <th className="px-4 py-3">Patente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-[#8997A6]">
                      No hay registros para la combinación de filtros seleccionada.
                    </td>
                  </tr>
                ) : (
                  filasFiltradas.map((fila, index) => (
                    <tr key={`${fila.movimientoId}-${fila.insumoId}-${index}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                        {formatFechaAnalista(fila.fecha)}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">{fila.tipo}</td>
                      <td className="max-w-[280px] px-4 py-3 font-medium text-[#171717]">
                        {fila.insumo}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">
                        {fila.rubro}
                        <span className="block text-xs text-[#8997A6]">
                          {fila.subrubro}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#171717]">
                        {formatCantidadAnalista(fila.cantidad)}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">{fila.unidad}</td>
                      <td className="px-4 py-3 text-[#171717]">{fila.destino}</td>
                      <td className="px-4 py-3 text-right text-[#171717]">
                        {formatMonedaAnalista(fila.costoUnitario)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#171717]">
                        {formatMonedaAnalista(fila.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-[#171717]">{fila.chofer}</td>
                      <td className="px-4 py-3 text-[#171717]">{fila.patente}</td>
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
