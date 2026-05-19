import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { subscribeInsumos, formatLabelInsumo, type Insumo } from '../../lib/insumos'
import {
  subscribeMovimientosInventario,
  opcionesHistorialAmplio,
  subscribeSaldoLotes,
  ubicacionEfectivaMovimiento,
  type MovimientoInventario,
  type SaldoLoteResumen,
} from '../../lib/movimientosInventario'
import { subscribeRegistrosComedorPorRango } from '../../lib/comedor'
import type { RegistroComedor } from '../../types/comedor'
import {
  enumerarDiasYmd,
  etiquetaUbicacionBi,
  filtrarMovimientosBi,
  filtrarSaldosBi,
  rangoMesActualYmd,
  valorizarInventarioPorSaldos,
  UBICACIONES_BI,
  parseYmdEndLocal,
  parseYmdStartLocal,
  type UbicacionFiltroBi,
} from '../../lib/analistaBiDashboard'
import {
  costoAlimentacionEgresosEnPeriodo,
  indicePerdidaDecomiso,
  serieDiariaEgresosValorYAsistencias,
} from '../../lib/analistaFinanciero'
import { detalleMovimientoAnalista, formatMonedaAnalista } from '../../lib/analista'

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
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        {title}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600">{help}</p>
    </article>
  )
}

export function AnalistaDashboardPage() {
  const def = useMemo(() => rangoMesActualYmd(), [])
  const [desde, setDesde] = useState(def.desde)
  const [hasta, setHasta] = useState(def.hasta)
  const [filtroUb, setFiltroUb] = useState<UbicacionFiltroBi>('TODAS')

  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [saldos, setSaldos] = useState<SaldoLoteResumen[]>([])
  const [registrosComedor, setRegistrosComedor] = useState<RegistroComedor[]>([])

  const fechasOk = desde && hasta && desde <= hasta

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => {
    return subscribeMovimientosInventario(
      setMovimientos,
      opcionesHistorialAmplio(20000),
    )
  }, [])
  useEffect(() => subscribeSaldoLotes(setSaldos), [])

  useEffect(() => {
    if (!fechasOk) {
      setRegistrosComedor([])
      return
    }
    return subscribeRegistrosComedorPorRango(desde, hasta, setRegistrosComedor)
  }, [desde, hasta, fechasOk])

  const desdeDt = useMemo(() => parseYmdStartLocal(desde), [desde])
  const hastaDt = useMemo(() => parseYmdEndLocal(hasta), [hasta])

  const saldosFiltrados = useMemo(() => filtrarSaldosBi(saldos, filtroUb), [saldos, filtroUb])

  const capitalInmovilizado = useMemo(
    () => valorizarInventarioPorSaldos(saldosFiltrados, insumos),
    [saldosFiltrados, insumos],
  )

  const costoAlimentacion = useMemo(() => {
    if (!fechasOk) return 0
    return costoAlimentacionEgresosEnPeriodo(movimientos, insumos, filtroUb, desdeDt, hastaDt)
  }, [movimientos, insumos, filtroUb, desdeDt, hastaDt, fechasOk])

  const perdida = useMemo(() => {
    if (!fechasOk) return { porcentaje: 0, valorDecomisoArs: 0, baseCirculacionArs: 0 }
    return indicePerdidaDecomiso(movimientos, insumos, filtroUb, desdeDt, hastaDt)
  }, [movimientos, insumos, filtroUb, desdeDt, hastaDt, fechasOk])

  const diasEje = useMemo(
    () => (fechasOk ? enumerarDiasYmd(desde, hasta) : []),
    [desde, hasta, fechasOk],
  )

  const serieMacro = useMemo(() => {
    if (!fechasOk) return []
    const movsRango = filtrarMovimientosBi(movimientos, 'TODAS', desdeDt, hastaDt)
    const regs = registrosComedor.filter((r) => r.diaOperativo >= desde && r.diaOperativo <= hasta)
    return serieDiariaEgresosValorYAsistencias(diasEje, regs, movsRango, insumos)
  }, [diasEje, movimientos, insumos, desde, hasta, desdeDt, hastaDt, registrosComedor, fechasOk])

  const chartData = useMemo(
    () =>
      serieMacro.map((p) => ({
        ...p,
        diaCorto: p.dia.slice(5),
      })),
    [serieMacro],
  )

  function exportarBalanceConsolidado() {
    if (!fechasOk) return
    const movs = filtrarMovimientosBi(movimientos, filtroUb, desdeDt, hastaDt)
    const hoja1 = [
      { Métrica: 'Capital inmovilizado (stock × costo catálogo)', Valor: capitalInmovilizado },
      { Métrica: 'Costo de alimentación (egresos valorizados en período)', Valor: costoAlimentacion },
      {
        Métrica: 'Índice pérdida / decomiso (%)',
        Valor: perdida.porcentaje,
      },
      { Métrica: 'Valor decomisos (ARS)', Valor: perdida.valorDecomisoArs },
      { Métrica: 'Base circulación ingresos+egresos+decomiso (ARS)', Valor: perdida.baseCirculacionArs },
      { Métrica: 'Desde', Valor: desde },
      { Métrica: 'Hasta', Valor: hasta },
      { Métrica: 'Sede', Valor: etiquetaUbicacionBi(filtroUb) },
    ]

    const insMap = new Map(insumos.map((i) => [i.id, i]))
    const stockPorInsumoUb = new Map<string, { ub: string; qty: number; valor: number }>()
    for (const s of filtrarSaldosBi(saldos, filtroUb)) {
      const ins = insMap.get(s.insumoId)
      const costo = ins?.costoPorUnidadBase ?? 0
      const key = `${s.insumoId}|${s.ubicacionId}`
      const prev = stockPorInsumoUb.get(key) ?? { ub: s.ubicacionId, qty: 0, valor: 0 }
      prev.qty += s.cantidad
      prev.valor += s.cantidad * costo
      stockPorInsumoUb.set(key, prev)
    }
    const hoja2 = [...stockPorInsumoUb.entries()].map(([key, v]) => {
      const insumoId = key.split('|')[0]
      const ins = insMap.get(insumoId)
      return {
        Insumo: ins ? formatLabelInsumo(ins) : insumoId,
        Ubicacion: v.ub,
        Cantidad: v.qty,
        Valor_ARS: v.valor,
      }
    })

    const hoja3 = movs.flatMap((mov) => {
      const ub = ubicacionEfectivaMovimiento(mov)
      const base = {
        id: mov.id,
        fecha: mov.fecha?.toISOString() ?? '',
        tipo: mov.tipo,
        ubicacionId: ub,
        detalle: detalleMovimientoAnalista(mov),
      }
      return mov.items.map((it, idx) => ({
        ...base,
        itemIdx: idx + 1,
        insumoId: it.insumoId,
        nombre: it.nombreSnapshot,
        cantidad: it.cantidad,
        lote: it.lote ?? '',
        vencimiento: it.fechaVencimiento ?? '',
      }))
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja1), 'Métricas Generales')
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(hoja2.length ? hoja2 : [{ Mensaje: 'Sin saldos' }]),
      'Auditoría de Stock',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(hoja3.length ? hoja3 : [{ Mensaje: 'Sin movimientos' }]),
      'Historial de Movimientos',
    )
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    XLSX.writeFile(
      wb,
      `Balance_financiero_${desde}_${hasta}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.xlsx`,
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Dashboard financiero
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Visión global (Colón, Cocina Central, Casposo). El gráfico inferior es siempre
              consolidado de toda la empresa.
            </p>
          </div>
          <button
            type="button"
            onClick={exportarBalanceConsolidado}
            disabled={!fechasOk}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exportar balance consolidado
          </button>
        </div>

        <div className="mx-auto mt-4 flex max-w-6xl flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <label className="flex min-w-[10rem] flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Desde *</span>
            <input
              type="date"
              required
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 shadow-sm outline-none focus:border-red-600/30 focus:ring-2 focus:ring-red-600/15"
            />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Hasta *</span>
            <input
              type="date"
              required
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 shadow-sm outline-none focus:border-red-600/30 focus:ring-2 focus:ring-red-600/15"
            />
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1">
            <span className="text-xs font-medium text-gray-800">Sede</span>
            <select
              value={filtroUb}
              onChange={(e) => setFiltroUb(e.target.value as UbicacionFiltroBi)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 shadow-sm outline-none focus:border-red-600/30 focus:ring-2 focus:ring-red-600/15"
            >
              {UBICACIONES_BI.map((u) => (
                <option key={u} value={u}>
                  {etiquetaUbicacionBi(u)}
                </option>
              ))}
            </select>
          </label>
          {!fechasOk && (
            <p className="text-sm text-red-600">Completá un rango de fechas válido (desde ≤ hasta).</p>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-3">
          <KpiCard
            title="Capital inmovilizado"
            value={formatMonedaAnalista(capitalInmovilizado)}
            help="Valoración del stock actual (saldo_lotes × costo base del catálogo) para la sede seleccionada."
          />
          <KpiCard
            title="Costo de alimentación"
            value={formatMonedaAnalista(costoAlimentacion)}
            help="Suma valorizada de egresos de inventario en el período y sede (incluye comandas y consumos registrados como egreso)."
          />
          <KpiCard
            title="Índice de pérdida / decomiso"
            value={`${perdida.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`}
            help={`${formatMonedaAnalista(perdida.valorDecomisoArs)} en decomisos sobre ${formatMonedaAnalista(perdida.baseCirculacionArs)} de circulación valorizada (ingresos + egresos + decomisos) en el período.`}
          />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Evolución: egresos valorizados vs asistencias comedor
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Consolidado macro (ignora filtro de sede). Eje izquierdo: ARS egresos diarios. Eje derecho:
            personas registradas en comedor por día operativo.
          </p>
          <div className="mt-4 h-[300px] w-full min-h-[280px]">
            {!fechasOk || chartData.length === 0 ? (
              <p className="text-sm text-gray-500">Indicá fechas válidas para ver la serie.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="diaCorto" tick={{ fontSize: 11, fill: '#374151' }} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString('es-AR', { notation: 'compact', compactDisplay: 'short' })
                    }
                    label={{ value: 'Egresos (ARS)', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    label={{ value: 'Asistencias', angle: 90, position: 'insideRight', fill: '#6b7280' }}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      const n =
                        typeof value === 'number'
                          ? value
                          : Number(value ?? 0)
                      if (name === 'egresosArs') return [formatMonedaAnalista(n), 'Egresos']
                      return [n, 'Asistencias']
                    }}
                    labelFormatter={(l) => `Día ${String(l)}`}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="egresosArs"
                    name="Egresos (ARS)"
                    stroke="#b91c1c"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="asistencias"
                    name="Asistencias comedor"
                    stroke="#475569"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
