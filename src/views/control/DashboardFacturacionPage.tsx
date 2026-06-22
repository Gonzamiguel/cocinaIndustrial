import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import { subscribeRegistrosComedorPorRango } from '../../lib/comedor'
import {
  CANTIDAD_COLUMNAS_SABANA_FACTURACION,
  COLUMNAS_SABANA_FACTURACION,
  consolidarFacturacionPorDni,
  empresasFacturacionOrdenadas,
  filaFacturacionComoFilasTabla,
  filtrarFilasFacturacionPorTexto,
  sumarTotalesFacturacion,
  totalesFacturacionComoFilaTabla,
  type FilaFacturacionOperario,
} from '../../lib/dashboardFacturacion'
import { subscribeHistorialPernoctes, subscribePadronPersonas } from '../../lib/hoteleria'
import type { HistorialPernocte, PadronPersona } from '../../types/hoteleria'
import type { RegistroComedor } from '../../types/comedor'

function hoyYmdLocal(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function primerDiaMesYmd(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-01`
}

function formatYmdLegible(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function CeldaNumero({ valor }: { valor: number }) {
  return (
    <td className="px-2 py-2 text-right text-xs tabular-nums text-neutral-900">{valor}</td>
  )
}

function exportarFacturacionExcel(
  filas: FilaFacturacionOperario[],
  totales: ReturnType<typeof sumarTotalesFacturacion>,
  desde: string,
  hasta: string,
  empresaFiltro: string,
): void {
  const empresaEtiqueta = empresaFiltro.trim() || 'Todas'
  const aoa: (string | number)[][] = [
    ['Facturación — Comedor y Hotelería'],
    [`Período exportado: ${formatYmdLegible(desde)} al ${formatYmdLegible(hasta)}`],
    [`Empresa: ${empresaEtiqueta}`],
    [],
    [...COLUMNAS_SABANA_FACTURACION],
    ...filas.map((f) => filaFacturacionComoFilasTabla(f)),
    [],
    totalesFacturacionComoFilaTabla(totales),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 20 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 11 },
    { wch: 10 },
    { wch: 9 },
    { wch: 8 },
    { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Facturación')
  const slugEmpresa = empresaFiltro.trim()
    ? empresaFiltro.trim().replace(/[^\w\-]+/g, '_').slice(0, 40)
    : 'todas'
  XLSX.writeFile(wb, `Facturacion_${desde}_${hasta}_${slugEmpresa}.xlsx`)
}

export function DashboardFacturacionPage() {
  const { showToast } = useToast()
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [busquedaTexto, setBusquedaTexto] = useState('')

  const [registros, setRegistros] = useState<RegistroComedor[]>([])
  const [historial, setHistorial] = useState<HistorialPernocte[]>([])
  const [padron, setPadron] = useState<PadronPersona[]>([])
  const [cargandoComedor, setCargandoComedor] = useState(true)

  const fechasOk = Boolean(desde && hasta && desde <= hasta)
  const colCount = CANTIDAD_COLUMNAS_SABANA_FACTURACION

  useEffect(() => {
    if (!fechasOk) {
      setRegistros([])
      setCargandoComedor(false)
      return
    }
    setCargandoComedor(true)
    const unsub = subscribeRegistrosComedorPorRango(desde, hasta, (rows) => {
      setRegistros(rows)
      setCargandoComedor(false)
    })
    return () => unsub()
  }, [desde, hasta, fechasOk])

  useEffect(() => subscribeHistorialPernoctes(setHistorial), [])
  useEffect(() => subscribePadronPersonas(setPadron), [])

  const padronPorId = useMemo(() => new Map(padron.map((p) => [p.id, p])), [padron])

  const empresasOpciones = useMemo(
    () =>
      fechasOk
        ? empresasFacturacionOrdenadas(padron, registros, historial, desde, hasta)
        : [],
    [padron, registros, historial, desde, hasta, fechasOk],
  )

  const filasConsolidadas = useMemo(() => {
    if (!fechasOk) return []
    return consolidarFacturacionPorDni(
      registros,
      historial,
      padronPorId,
      desde,
      hasta,
      empresaFiltro,
    )
  }, [registros, historial, padronPorId, desde, hasta, fechasOk, empresaFiltro])

  const filasVisibles = useMemo(
    () => filtrarFilasFacturacionPorTexto(filasConsolidadas, busquedaTexto),
    [filasConsolidadas, busquedaTexto],
  )

  const totalesGenerales = useMemo(
    () => sumarTotalesFacturacion(filasVisibles),
    [filasVisibles],
  )

  const cargando = cargandoComedor && fechasOk

  function handleExportar() {
    if (!fechasOk) {
      showToast('Indicá un rango de fechas válido.', 'error')
      return
    }
    if (filasVisibles.length === 0) {
      showToast('No hay datos para exportar con los filtros actuales.', 'info')
      return
    }
    try {
      exportarFacturacionExcel(
        filasVisibles,
        totalesGenerales,
        desde,
        hasta,
        empresaFiltro,
      )
      showToast('Facturación exportada.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo exportar el Excel.', 'error')
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Área contable
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
              Facturación
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Consolidación por operario con desglose de servicios de comedor (cada categoría con
              costo unitario propio) y noches de hotelería.
            </p>
          </div>
          <button
            type="button"
            disabled={!fechasOk || cargando}
            onClick={handleExportar}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-5 w-5" aria-hidden />
            📥 Descargar Excel
          </button>
        </div>

        <div className="mx-auto mt-5 flex max-w-7xl flex-wrap items-end gap-4 rounded-xl border border-neutral-200 bg-neutral-50/80 px-4 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-700">Fecha desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-700">Fecha hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
            />
          </label>
          <label className="flex min-w-[14rem] flex-col gap-1">
            <span className="text-xs font-medium text-neutral-700">Empresa</span>
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
            >
              <option value="">Todas</option>
              {empresasOpciones.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 sm:min-w-[18rem]">
            <span className="text-xs font-medium text-neutral-700">Buscar por apellido o DNI</span>
            <input
              type="search"
              value={busquedaTexto}
              onChange={(e) => setBusquedaTexto(e.target.value)}
              placeholder="Ej. GARCÍA o 30123456"
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              Consumos consolidados por operario
            </h2>
            {cargando ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cargando registros…
              </span>
            ) : (
              <span className="text-xs text-neutral-500">
                {filasVisibles.length} operario{filasVisibles.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-600">
                  <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2.5 font-semibold">DNI</th>
                  <th className="min-w-[9rem] px-3 py-2.5 font-semibold">Nombre</th>
                  <th className="min-w-[8rem] px-3 py-2.5 font-semibold">Empresa</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Noches</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Desayunos</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Almuerzos</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Refrigerios</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Meriendas</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Viandas</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Cenas</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">
                    Cenas Nocheros
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {!fechasOk ? (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-10 text-center text-neutral-500">
                      Indicá un rango de fechas válido (desde ≤ hasta).
                    </td>
                  </tr>
                ) : cargando ? (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-10 text-center text-neutral-500">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#CD1818]" aria-hidden />
                    </td>
                  </tr>
                ) : filasVisibles.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-10 text-center text-neutral-500">
                      Sin consumos en el período con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filasVisibles.map((fila) => (
                    <tr key={fila.dni} className="hover:bg-neutral-50/80">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-xs text-neutral-800">
                        {fila.dni}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-900">{fila.nombreCompleto}</td>
                      <td className="px-3 py-2 text-xs text-neutral-700">{fila.empresa}</td>
                      <CeldaNumero valor={fila.totalNoches} />
                      <CeldaNumero valor={fila.totalDesayunos} />
                      <CeldaNumero valor={fila.totalAlmuerzos} />
                      <CeldaNumero valor={fila.totalRefrigerios} />
                      <CeldaNumero valor={fila.totalMeriendas} />
                      <CeldaNumero valor={fila.totalViandas} />
                      <CeldaNumero valor={fila.totalCenas} />
                      <CeldaNumero valor={fila.totalCenasNocheros} />
                    </tr>
                  ))
                )}
              </tbody>
              {fechasOk && !cargando && filasVisibles.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 bg-[#CD1818]/5 text-xs font-semibold text-neutral-900">
                    <td className="sticky left-0 z-10 bg-[#CD1818]/5 px-3 py-2.5" colSpan={3}>
                      TOTALES GENERALES
                    </td>
                    <CeldaNumero valor={totalesGenerales.totalNoches} />
                    <CeldaNumero valor={totalesGenerales.totalDesayunos} />
                    <CeldaNumero valor={totalesGenerales.totalAlmuerzos} />
                    <CeldaNumero valor={totalesGenerales.totalRefrigerios} />
                    <CeldaNumero valor={totalesGenerales.totalMeriendas} />
                    <CeldaNumero valor={totalesGenerales.totalViandas} />
                    <CeldaNumero valor={totalesGenerales.totalCenas} />
                    <CeldaNumero valor={totalesGenerales.totalCenasNocheros} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
