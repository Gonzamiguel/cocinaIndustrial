import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import type { Cama, HistorialLimpieza } from '../../types/hoteleria'
import { subscribeCamas, subscribeHistorialLimpiezas } from '../../lib/hoteleria'

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

/** Inicio del día local para un string YYYY-MM-DD. */
function inicioDiaLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

/** Fin del día local (23:59:59.999) para un string YYYY-MM-DD. */
function finDiaLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)
}

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${mo}/${y} ${h}:${min}`
}

function formatSoloFecha(d: Date | null): string {
  if (!d) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${mo}/${d.getFullYear()}`
}

function formatSoloHora(d: Date | null): string {
  if (!d) return ''
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

function maxPorClave(map: Map<string, number>): { clave: string; n: number } {
  let clave = '—'
  let n = 0
  for (const [k, v] of map.entries()) {
    const key = k.trim() || '(sin dato)'
    if (v > n || (v === n && key.localeCompare(clave, 'es', { sensitivity: 'base' }) < 0)) {
      n = v
      clave = key
    }
  }
  return { clave, n }
}

export function ReporteLimpiezaPage() {
  const { showToast } = useToast()
  const [historial, setHistorial] = useState<HistorialLimpieza[]>([])
  const [camas, setCamas] = useState<Cama[]>([])
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())

  useEffect(() => {
    const unsub = subscribeHistorialLimpiezas(setHistorial)
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribeCamas(setCamas)
    return () => unsub()
  }, [])

  const denominacionPorCamaId = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of camas) m.set(c.id, c.denominacion.trim() || '—')
    return m
  }, [camas])

  const rangoValido = useMemo(() => {
    if (!desde || !hasta) return false
    return desde <= hasta
  }, [desde, hasta])

  const filtradas = useMemo(() => {
    if (!rangoValido) return []
    const t0 = inicioDiaLocalYmd(desde).getTime()
    const t1 = finDiaLocalYmd(hasta).getTime()
    return historial.filter((h) => {
      const f = h.fechaLimpieza
      if (!f) return false
      const t = f.getTime()
      return t >= t0 && t <= t1
    })
  }, [historial, desde, hasta, rangoValido])

  const filasOrdenadas = useMemo(() => {
    return [...filtradas].sort((a, b) => {
      const ta = a.fechaLimpieza?.getTime() ?? 0
      const tb = b.fechaLimpieza?.getTime() ?? 0
      return tb - ta
    })
  }, [filtradas])

  const kpis = useMemo(() => {
    const total = filtradas.length
    const porResponsable = new Map<string, number>()
    const porSector = new Map<string, number>()
    for (const h of filtradas) {
      const r = h.responsableLimpieza.trim() || '(sin responsable)'
      porResponsable.set(r, (porResponsable.get(r) ?? 0) + 1)
      const s = h.sector.trim() || '(sin sector)'
      porSector.set(s, (porSector.get(s) ?? 0) + 1)
    }
    const topResp = maxPorClave(porResponsable)
    const topSector = maxPorClave(porSector)
    return {
      total,
      responsableNombre: total > 0 ? topResp.clave : '—',
      responsableCount: topResp.n,
      sectorNombre: total > 0 ? topSector.clave : '—',
      sectorCount: topSector.n,
    }
  }, [filtradas])

  function exportarExcel() {
    if (!rangoValido) {
      showToast('Indicá un rango de fechas válido (desde / hasta).', 'error')
      return
    }
    if (!filasOrdenadas.length) {
      showToast('No hay datos para exportar en ese rango.', 'error')
      return
    }
    const header = ['Fecha', 'Hora', 'Responsable', 'Sector', 'Habitación', 'Cama']
    const dataRows = filasOrdenadas.map((h) => {
      const f = h.fechaLimpieza
      const cama =
        denominacionPorCamaId.get(h.camaId) ??
        (h.camaId ? '(cama no encontrada)' : '—')
      return [
        formatSoloFecha(f),
        formatSoloHora(f),
        h.responsableLimpieza.trim() || '—',
        h.sector.trim() || '—',
        h.habitacion.trim() || '—',
        cama,
      ]
    })
    const aoa: string[][] = [header, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Limpiezas')
    const nombre = `auditoria_limpiezas_${desde}_${hasta}.xlsx`
    XLSX.writeFile(wb, nombre)
    showToast('Archivo Excel generado.', 'success')
  }

  return (
    <div className="min-h-full w-full bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="border-b border-neutral-100 pb-5">
            <h1 className="text-xl font-semibold tracking-tight text-gray-800">
              Reporte de auditoría de limpieza
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Registros de limpieza (camas sucias liberadas) según el rango de fechas. Los datos se
              filtran en este equipo a partir de la colección sincronizada.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Desde <span className="text-red-600">*</span>
                </span>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  required
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Hasta <span className="text-red-600">*</span>
                </span>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  required
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={!rangoValido || !filasOrdenadas.length}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Exportar a Excel
            </button>
          </div>
          {!rangoValido && desde && hasta ? (
            <p className="mt-4 text-sm text-red-600">
              La fecha &quot;Desde&quot; no puede ser posterior a &quot;Hasta&quot;.
            </p>
          ) : null}

          {rangoValido ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-800">{kpis.total}</p>
                <p className="mt-1 text-sm text-neutral-500">Total limpiezas</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Registros en el rango seleccionado (fecha y hora de la limpieza).
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-800">
                  {kpis.total > 0 ? kpis.responsableCount : '—'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Personal más activo</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-gray-800"
                  title={kpis.responsableNombre !== '—' ? kpis.responsableNombre : undefined}
                >
                  {kpis.total > 0 ? kpis.responsableNombre : 'Sin datos en el rango'}
                </p>
                <p className="mt-2 text-xs text-neutral-400">Mayor cantidad de limpiezas registradas.</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-800">
                  {kpis.total > 0 ? kpis.sectorCount : '—'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Sector con más rotación</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-gray-800"
                  title={kpis.sectorNombre !== '—' ? kpis.sectorNombre : undefined}
                >
                  {kpis.total > 0 ? kpis.sectorNombre : 'Sin datos en el rango'}
                </p>
                <p className="mt-2 text-xs text-neutral-400">Más limpiezas por sector en el período.</p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-100">
            <div className="max-h-[min(60vh,520px)] overflow-auto">
              <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Fecha y hora</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3">Sector</th>
                    <th className="px-4 py-3">Habitación</th>
                    <th className="px-4 py-3">Cama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                  {!rangoValido ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                        Completá las fechas Desde y Hasta para generar el reporte.
                      </td>
                    </tr>
                  ) : filasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                        No hay limpiezas registradas en el rango seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filasOrdenadas.map((h) => {
                      const cama =
                        denominacionPorCamaId.get(h.camaId) ??
                        (h.camaId ? '(no en catálogo)' : '—')
                      return (
                        <tr key={h.id} className="hover:bg-neutral-50/80">
                          <td className="px-4 py-3 tabular-nums text-neutral-700">
                            {formatFechaHora(h.fechaLimpieza)}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {h.responsableLimpieza.trim() || '—'}
                          </td>
                          <td className="px-4 py-3">{h.sector.trim() || '—'}</td>
                          <td className="px-4 py-3">{h.habitacion.trim() || '—'}</td>
                          <td className="px-4 py-3">{cama}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
