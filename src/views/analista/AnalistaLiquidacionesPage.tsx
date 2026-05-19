import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { subscribeRegistrosComedorPorRango } from '../../lib/comedor'
import type { RegistroComedor } from '../../types/comedor'
import { subscribeHistorialPernoctes, subscribePadronPersonas } from '../../lib/hoteleria'
import type { HistorialPernocte, PadronPersona } from '../../types/hoteleria'
import { filasPernoctesDetalladas } from '../../lib/hoteleriaPernoctes'
import {
  buildResumenLiquidacionPorEmpresa,
  empresasUnicasOrdenadas,
} from '../../lib/analistaLiquidaciones'
import { etiquetaServicioComedor } from '../../lib/servicioComedor'
import { formatFechaAnalista } from '../../lib/analista'
import { rangoMesActualYmd } from '../../lib/analistaBiDashboard'

const PAGE_SIZE = 25

function formatFechaHoraReg(r: RegistroComedor): string {
  return formatFechaAnalista(r.fechaHora)
}

export function AnalistaLiquidacionesPage() {
  const def = useMemo(() => rangoMesActualYmd(), [])
  const [desde, setDesde] = useState(def.desde)
  const [hasta, setHasta] = useState(def.hasta)
  const [empresaSel, setEmpresaSel] = useState('')
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('')

  const [registros, setRegistros] = useState<RegistroComedor[]>([])
  const [historial, setHistorial] = useState<HistorialPernocte[]>([])
  const [padron, setPadron] = useState<PadronPersona[]>([])

  const fechasOk = Boolean(desde && hasta && desde <= hasta)

  useEffect(() => {
    if (!fechasOk) {
      setRegistros([])
      return
    }
    return subscribeRegistrosComedorPorRango(desde, hasta, setRegistros)
  }, [desde, hasta, fechasOk])

  useEffect(() => subscribeHistorialPernoctes(setHistorial), [])
  useEffect(() => subscribePadronPersonas(setPadron), [])

  const padronPorId = useMemo(() => new Map(padron.map((p) => [p.id, p])), [padron])

  const empresasLista = useMemo(
    () => empresasUnicasOrdenadas(registros, historial, desde, hasta),
    [registros, historial, desde, hasta],
  )

  const empresasFiltradasBusqueda = useMemo(() => {
    const q = busquedaEmpresa.trim().toLowerCase()
    if (!q) return empresasLista
    return empresasLista.filter((e) => e.toLowerCase().includes(q))
  }, [empresasLista, busquedaEmpresa])

  const resumenRows = useMemo(() => {
    if (!fechasOk) return []
    const all = buildResumenLiquidacionPorEmpresa(registros, historial, desde, hasta)
    if (!empresaSel) return all
    return all.filter((r) => r.empresa === empresaSel)
  }, [registros, historial, desde, hasta, fechasOk, empresaSel])

  const detalleRegs = useMemo(() => {
    if (!fechasOk) return []
    return registros
      .filter((r) => {
        if (r.diaOperativo < desde || r.diaOperativo > hasta) return false
        if (!empresaSel) return true
        const emp = r.empresa.trim() || '—'
        return emp === empresaSel
      })
      .sort((a, b) => (b.fechaHora?.getTime() ?? 0) - (a.fechaHora?.getTime() ?? 0))
  }, [registros, desde, hasta, fechasOk, empresaSel])

  const [page, setPage] = useState(0)
  useEffect(() => {
    setPage(0)
  }, [desde, hasta, empresaSel, detalleRegs.length])

  const detallePagina = useMemo(() => {
    const start = page * PAGE_SIZE
    return detalleRegs.slice(start, start + PAGE_SIZE)
  }, [detalleRegs, page])

  const filasPernocte = useMemo(() => {
    if (!fechasOk) return []
    const filas = filasPernoctesDetalladas(historial, padronPorId, desde, hasta)
    if (!empresaSel) return filas
    return filas.filter((f) => f.empresa === empresaSel)
  }, [historial, padronPorId, desde, hasta, fechasOk, empresaSel])

  function exportarExcel() {
    if (!fechasOk) return
    const resumen = buildResumenLiquidacionPorEmpresa(registros, historial, desde, hasta)
    const resumenFiltrado = empresaSel ? resumen.filter((r) => r.empresa === empresaSel) : resumen

    const hojaResumen = resumenFiltrado.map((r) => ({
      Empresa: r.empresa,
      'Total pernoctes': r.pernoctes,
      Desayunos: r.desayunos,
      Meriendas: r.meriendas,
      'Almuerzos (base)': r.almuerzosBase,
      'Refrigerios almuerzo': r.refrigeriosAlmuerzo,
      'Cenas (base)': r.cenas,
      'Refrigerios cena (CENA_NOCHERO)': r.refrigeriosCenaNochero,
    }))

    const hojaDetalleComedor = detalleRegs.map((r) => ({
      'Día operativo': r.diaOperativo,
      'Fecha/Hora': r.fechaHora ? r.fechaHora.toISOString() : '',
      DNI: r.dni,
      Nombre: r.nombre,
      Apellido: r.apellido,
      Empresa: r.empresa,
      Servicio: etiquetaServicioComedor(r.servicio),
      'Código servicio': r.servicio,
      'Contiene refrigerio': r.contieneRefrigerio === true ? 'Sí' : r.contieneRefrigerio === false ? 'No' : '',
      'Usuario registro': r.usuarioRegistro,
    }))

    const hojaPernoctes = filasPernocte.map((f) => ({
      Empresa: f.empresa,
      DNI: f.dni,
      'Nombre y apellido': f.nombreApellido,
      'Noches en período': f.nochesEnFiltro,
      'Check-in': f.fechaCheckIn?.toISOString() ?? '',
      'Check-out': f.fechaCheckOut?.toISOString() ?? '',
      'Historial id': f.historialId,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(hojaResumen.length ? hojaResumen : [{ Mensaje: 'Sin datos' }]),
      'Resumen por empresa',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        hojaDetalleComedor.length ? hojaDetalleComedor : [{ Mensaje: 'Sin registros comedor' }],
      ),
      'Detalle comedor',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        hojaPernoctes.length ? hojaPernoctes : [{ Mensaje: 'Sin pernoctes en filtro' }],
      ),
      'Detalle pernoctes',
    )
    XLSX.writeFile(wb, `Liquidacion_contratistas_${desde}_${hasta}.xlsx`)
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Liquidación contratistas</h1>
            <p className="mt-1 text-sm text-gray-600">
              Cruce de consumos en comedor (`registros_comedor`) y noches de hotelería
              (`historial_pernoctes`) por empresa.
            </p>
          </div>
          <button
            type="button"
            disabled={!fechasOk}
            onClick={exportarExcel}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exportar Excel
          </button>
        </div>
        <div className="mx-auto mt-4 flex max-w-6xl flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Desde *</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 px-2 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Hasta *</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 px-2 text-sm text-gray-900"
            />
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Empresa</span>
            <select
              value={empresaSel}
              onChange={(e) => setEmpresaSel(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 px-2 text-sm text-gray-900"
            >
              <option value="">Todas las empresas</option>
              {empresasFiltradasBusqueda.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Buscar empresa</span>
            <input
              type="search"
              value={busquedaEmpresa}
              onChange={(e) => setBusquedaEmpresa(e.target.value)}
              placeholder="Filtra el listado…"
              className="min-h-10 rounded-lg border border-gray-200 px-2 text-sm text-gray-900"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Resumen por empresa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2 text-right">Pernoctes</th>
                  <th className="px-3 py-2 text-right">Desayunos</th>
                  <th className="px-3 py-2 text-right">Meriendas</th>
                  <th className="px-3 py-2 text-right">Almuerzos</th>
                  <th className="px-3 py-2 text-right">Ref. almuerzo</th>
                  <th className="px-3 py-2 text-right">Cenas</th>
                  <th className="px-3 py-2 text-right">Ref. cena (nochero)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!fechasOk ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                      Indicá fechas válidas.
                    </td>
                  </tr>
                ) : resumenRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                      Sin datos en el rango.
                    </td>
                  </tr>
                ) : (
                  resumenRows.map((r) => (
                    <tr key={r.empresa}>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.empresa}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.pernoctes}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.desayunos}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.meriendas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.almuerzosBase}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {r.refrigeriosAlmuerzo}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.cenas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {r.refrigeriosCenaNochero}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Detalle de auditoría (comedor)</h2>
            <p className="text-xs text-gray-500">{detalleRegs.length} registros · Página {page + 1}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                  <th className="px-3 py-2">Fecha / hora</th>
                  <th className="px-3 py-2">DNI</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Apellido</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Servicio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detallePagina.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                      Sin filas en esta página.
                    </td>
                  </tr>
                ) : (
                  detallePagina.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-900">{formatFechaHoraReg(r)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.dni}</td>
                      <td className="px-3 py-2 text-gray-900">{r.nombre}</td>
                      <td className="px-3 py-2 text-gray-900">{r.apellido}</td>
                      <td className="px-3 py-2 text-gray-800">{r.empresa || '—'}</td>
                      <td className="px-3 py-2 text-gray-900">{etiquetaServicioComedor(r.servicio)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={(page + 1) * PAGE_SIZE >= detalleRegs.length}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
