import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import type { HistorialPernocte, PadronPersona } from '../../types/hoteleria'
import { filasPernoctesDetalladas } from '../../lib/hoteleriaPernoctes'
import { subscribeHistorialPernoctes, subscribePadronPersonas } from '../../lib/hoteleria'

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

function formatFechaLocal(d: Date | null): string {
  if (!d) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${m}/${d.getFullYear()}`
}

export function PernoctesPage() {
  const { showToast } = useToast()
  const [historial, setHistorial] = useState<HistorialPernocte[]>([])
  const [padron, setPadron] = useState<PadronPersona[]>([])
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())

  useEffect(() => {
    const unsub = subscribeHistorialPernoctes(setHistorial)
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribePadronPersonas(setPadron)
    return () => unsub()
  }, [])

  const padronPorId = useMemo(() => {
    const m = new Map<string, PadronPersona>()
    for (const p of padron) m.set(p.id, p)
    return m
  }, [padron])

  const rangoValido = useMemo(() => {
    if (!desde || !hasta) return false
    return desde <= hasta
  }, [desde, hasta])

  const filasDetalle = useMemo(() => {
    if (!rangoValido) return []
    return filasPernoctesDetalladas(historial, padronPorId, desde, hasta)
  }, [historial, padronPorId, desde, hasta, rangoValido])

  const kpis = useMemo(() => {
    const totalNoches = filasDetalle.reduce((s, f) => s + f.nochesEnFiltro, 0)
    const huespedesUnicos = new Set(filasDetalle.map((f) => f.personaId)).size
    const porEmpresa = new Map<string, number>()
    for (const f of filasDetalle) {
      porEmpresa.set(f.empresa, (porEmpresa.get(f.empresa) ?? 0) + f.nochesEnFiltro)
    }
    let empresaTop = '—'
    let empresaTopNoches = 0
    for (const [emp, n] of porEmpresa.entries()) {
      if (n > empresaTopNoches || (n === empresaTopNoches && emp.localeCompare(empresaTop, 'es') < 0)) {
        empresaTopNoches = n
        empresaTop = emp
      }
    }
    return { totalNoches, huespedesUnicos, empresaTop, empresaTopNoches }
  }, [filasDetalle])

  function exportarExcel() {
    if (!rangoValido) {
      showToast('Indicá un rango de fechas válido (desde / hasta).', 'error')
      return
    }
    if (!filasDetalle.length) {
      showToast('No hay datos para exportar en ese rango.', 'error')
      return
    }
    const header = [
      'DNI',
      'Nombre y Apellido',
      'Empresa',
      'Fecha Check-In',
      'Fecha Check-Out',
      'Noches (en filtro)',
    ]
    const dataRows = filasDetalle.map((f) => [
      f.dni,
      f.nombreApellido,
      f.empresa,
      formatFechaLocal(f.fechaCheckIn),
      f.fechaCheckOut ? formatFechaLocal(f.fechaCheckOut) : 'En campamento',
      f.nochesEnFiltro,
    ])
    const totalNoches = filasDetalle.reduce((s, f) => s + f.nochesEnFiltro, 0)
    const totalRow = ['Total General', '', '', '', '', totalNoches]
    const aoa: (string | number)[][] = [header, ...dataRows, totalRow]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pernoctes')
    const nombre = `pernoctes_detalle_${desde}_${hasta}.xlsx`
    XLSX.writeFile(wb, nombre)
    showToast('Archivo Excel generado.', 'success')
  }

  return (
    <div className="min-h-full w-full bg-neutral-100">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
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
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={!rangoValido || !filasDetalle.length}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
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
                <p className="text-3xl font-bold tabular-nums text-gray-800">{kpis.totalNoches}</p>
                <p className="mt-1 text-sm text-neutral-500">Total de pernoctes</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Suma de noches facturables dentro del rango seleccionado.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-800">{kpis.huespedesUnicos}</p>
                <p className="mt-1 text-sm text-neutral-500">Huéspedes únicos</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Personas distintas con al menos una noche en el rango.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-800">
                  {kpis.empresaTopNoches > 0 ? kpis.empresaTopNoches : '—'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Empresa con más pernoctes</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-gray-800"
                  title={kpis.empresaTop !== '—' ? kpis.empresaTop : undefined}
                >
                  {kpis.empresaTopNoches > 0 ? kpis.empresaTop : 'Sin datos en el rango'}
                </p>
                <p className="mt-2 text-xs text-neutral-400">Noches facturables atribuidas a esa empresa.</p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 overflow-x-auto rounded-xl border border-neutral-100">
            <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Nombre y Apellido</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Fecha check-in</th>
                  <th className="px-4 py-3">Fecha check-out</th>
                  <th className="px-4 py-3 text-right">Noches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                {!rangoValido ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      Completá las fechas Desde y Hasta para generar el reporte.
                    </td>
                  </tr>
                ) : filasDetalle.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      No hay pernoctes registrados en el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filasDetalle.map((f) => (
                      <tr key={f.historialId} className="hover:bg-neutral-50/80">
                        <td className="px-4 py-3 font-mono text-xs">{f.dni}</td>
                        <td className="px-4 py-3 font-medium">{f.nombreApellido}</td>
                        <td className="px-4 py-3">{f.empresa}</td>
                        <td className="px-4 py-3 tabular-nums">{formatFechaLocal(f.fechaCheckIn)}</td>
                        <td className="px-4 py-3">
                          {f.fechaCheckOut ? (
                            <span className="tabular-nums">{formatFechaLocal(f.fechaCheckOut)}</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                              En campamento
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{f.nochesEnFiltro}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-neutral-200 bg-neutral-50/90 font-semibold">
                      <td colSpan={5} className="px-4 py-3 text-right text-neutral-700">
                        Total general (noches en filtro)
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {kpis.totalNoches}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
