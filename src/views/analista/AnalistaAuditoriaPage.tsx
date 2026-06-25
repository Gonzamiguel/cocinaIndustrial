import { useEffect, useMemo, useState } from 'react'
import { subscribeRegistrosComedorPorRango } from '../../lib/comedor'
import type { RegistroComedor } from '../../types/comedor'
import {
  subscribeMovimientosInventario,
  opcionesHistorialAmplio,
  subscribeProduccionCocinaRegistros,
  UBICACION_COCINA_CENTRAL,
  type MovimientoInventario,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'
import {
  enumerarDiasYmd,
  fechaEnRangoInclusivo,
  parseYmdEndLocal,
  parseYmdStartLocal,
  filtrarMovimientosBi,
  rangoMesActualYmd,
} from '../../lib/analistaBiDashboard'
import { tablaAuditoriaCasposoPorDia } from '../../lib/analistaFinanciero'
import { formatMonedaAnalista } from '../../lib/analista'

type SedeAuditoria = 'CASPOSO' | 'COCINA'

function formatFechaCorta(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AnalistaAuditoriaPage() {
  const def = useMemo(() => rangoMesActualYmd(), [])
  const [desde, setDesde] = useState(def.desde)
  const [hasta, setHasta] = useState(def.hasta)
  const [sede, setSede] = useState<SedeAuditoria>('CASPOSO')

  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [produccion, setProduccion] = useState<ProduccionCocinaRegistro[]>([])
  const [registrosComedor, setRegistrosComedor] = useState<RegistroComedor[]>([])

  const fechasOk = Boolean(desde && hasta && desde <= hasta)
  const desdeDt = useMemo(() => parseYmdStartLocal(desde), [desde])
  const hastaDt = useMemo(() => parseYmdEndLocal(hasta), [hasta])

  useEffect(() => {
    return subscribeMovimientosInventario(
      setMovimientos,
      opcionesHistorialAmplio(20000),
    )
  }, [])
  useEffect(() => subscribeProduccionCocinaRegistros(setProduccion, 800), [])

  useEffect(() => {
    if (!fechasOk) {
      setRegistrosComedor([])
      return
    }
    return subscribeRegistrosComedorPorRango(desde, hasta, setRegistrosComedor)
  }, [desde, hasta, fechasOk])

  const movsRango = useMemo(
    () => (fechasOk ? filtrarMovimientosBi(movimientos, 'TODAS', desdeDt, hastaDt) : []),
    [movimientos, desdeDt, hastaDt, fechasOk],
  )

  const regsRango = useMemo(
    () => registrosComedor.filter((r) => r.diaOperativo >= desde && r.diaOperativo <= hasta),
    [registrosComedor, desde, hasta],
  )

  const dias = useMemo(() => (fechasOk ? enumerarDiasYmd(desde, hasta) : []), [desde, hasta, fechasOk])

  const filasCasposo = useMemo(
    () => tablaAuditoriaCasposoPorDia(dias, movsRango, regsRango),
    [dias, movsRango, regsRango],
  )

  const filasCocina = useMemo(() => {
    return produccion.filter(
      (p) =>
        p.ubicacionId === UBICACION_COCINA_CENTRAL &&
        p.fecha != null &&
        fechaEnRangoInclusivo(p.fecha, desdeDt, hastaDt),
    )
  }, [produccion, desdeDt, hastaDt])

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-semibold text-gray-900">Auditoría operativa</h1>
          <div className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
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
            <label className="flex min-w-[14rem] flex-col gap-1">
              <span className="text-xs font-medium text-gray-800">Sede operativa</span>
              <select
                value={sede}
                onChange={(e) => setSede(e.target.value as SedeAuditoria)}
                className="min-h-10 rounded-lg border border-gray-200 px-2 text-sm text-gray-900"
              >
                <option value="CASPOSO">CASPOSO</option>
                <option value="COCINA">COCINA CENTRAL</option>
              </select>
            </label>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {sede === 'CASPOSO' ? (
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Casposo — comandas de consumo vs asistencias
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Comandas = cantidad de egresos con motivo consumo diario en CASPOSO. Desvío = (comandas −
                asistencias) / asistencias.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2 text-right">Comandas stock</th>
                    <th className="px-3 py-2 text-right">Asistencias</th>
                    <th className="px-3 py-2 text-right">Desvío %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!fechasOk ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-gray-500">
                        Indicá fechas válidas.
                      </td>
                    </tr>
                  ) : (
                    filasCasposo.map((f) => {
                      const alerta = f.desvioPct != null && Math.abs(f.desvioPct) > 5
                      return (
                        <tr key={f.fecha}>
                          <td className="px-3 py-2 text-gray-900">{f.fecha}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {f.comandasStock}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {f.asistencias}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
                              alerta ? 'text-red-600' : 'text-gray-900'
                            }`}
                          >
                            {f.desvioPct == null ? '—' : `${f.desvioPct.toFixed(1)} %`}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Cocina central — eficiencia de recetas
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Costo teórico de ficha técnica vs costo real declarado al registrar la producción.
              </p>
            </div>
            <div className="max-h-[min(75vh,880px)] overflow-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Plato / producto</th>
                    <th className="px-3 py-2">Lote</th>
                    <th className="px-3 py-2">Vto</th>
                    <th className="px-3 py-2 text-right">Porc.</th>
                    <th className="px-3 py-2 text-right">Costo teórico</th>
                    <th className="px-3 py-2 text-right">Costo real</th>
                    <th className="px-3 py-2 text-right">Desvío %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!fechasOk ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                        Indicá fechas válidas.
                      </td>
                    </tr>
                  ) : filasCocina.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                        Sin producciones registradas en el período.
                      </td>
                    </tr>
                  ) : (
                    filasCocina.map((r) => {
                      const alerta = Math.abs(r.desvioPorcentaje) > 5
                      return (
                        <tr key={r.id} className={alerta ? 'bg-red-50/80' : ''}>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-900">
                            {formatFechaCorta(r.fecha)}
                          </td>
                          <td className="px-3 py-2 text-gray-900">
                            <span className="font-medium">{r.nombreProducto}</span>
                            <span className="mt-0.5 block text-xs text-gray-500">
                              {r.recetaNombre}
                              {r.codigoTrazabilidad
                                ? ` · ${r.codigoTrazabilidad}`
                                : ''}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-800">
                            {r.loteProducto || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-800">
                            {r.fechaVencimiento || '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {r.cantidadPorciones}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {formatMonedaAnalista(r.costoTeorico)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {formatMonedaAnalista(r.costoReal)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              alerta ? 'text-red-600' : 'text-gray-900'
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
          </section>
        )}
      </div>
    </div>
  )
}
