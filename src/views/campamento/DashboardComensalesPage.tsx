import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import type { RegistroComedor, ServicioComedor } from '../../types/comedor'
import {
  SERVICIOS_COMEDOR_PRINCIPALES,
  subscribeRegistrosComedorPorRango,
} from '../../lib/comedor'
import { etiquetaServicioComedor } from '../../lib/servicioComedor'

const PAGE_SIZE = 40

type FiltroServicio = 'TODOS' | ServicioComedor

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

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const y = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${mo}/${y} ${h}:${min}`
}

function maxPorClave(map: Map<string, number>): { clave: string; n: number } {
  let clave = '—'
  let n = 0
  for (const [k, v] of map.entries()) {
    const key = k.trim() || '(sin empresa)'
    if (v > n || (v === n && key.localeCompare(clave, 'es', { sensitivity: 'base' }) < 0)) {
      n = v
      clave = key
    }
  }
  return { clave, n }
}

function truncarUid(uid: string): string {
  const u = uid.trim()
  if (u.length <= 12) return u
  return `${u.slice(0, 8)}…${u.slice(-4)}`
}

export function DashboardComensalesPage() {
  const { showToast } = useToast()
  const [registros, setRegistros] = useState<RegistroComedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [servicioFiltro, setServicioFiltro] = useState<FiltroServicio>('TODOS')
  const [pagina, setPagina] = useState(1)

  const rangoValido = useMemo(() => Boolean(desde && hasta && desde <= hasta), [desde, hasta])

  useEffect(() => {
    if (!rangoValido) {
      setRegistros([])
      setCargando(false)
      return
    }
    setCargando(true)
    const unsub = subscribeRegistrosComedorPorRango(desde, hasta, (rows) => {
      setRegistros(rows)
      setCargando(false)
    })
    return () => unsub()
  }, [desde, hasta, rangoValido])

  useEffect(() => {
    setPagina(1)
  }, [desde, hasta, empresaFiltro, servicioFiltro])

  const empresasOpciones = useMemo(() => {
    const set = new Set<string>()
    for (const r of registros) {
      const e = r.empresa.trim()
      if (e) set.add(e)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [registros])

  const filtrados = useMemo(() => {
    return registros.filter((r) => {
      if (empresaFiltro && r.empresa.trim() !== empresaFiltro) return false
      if (servicioFiltro !== 'TODOS' && r.servicio !== servicioFiltro) return false
      return true
    })
  }, [registros, empresaFiltro, servicioFiltro])

  const filasOrdenadas = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const ta = a.fechaHora?.getTime() ?? 0
      const tb = b.fechaHora?.getTime() ?? 0
      if (tb !== ta) return tb - ta
      return b.diaOperativo.localeCompare(a.diaOperativo)
    })
  }, [filtrados])

  const totalPaginas = Math.max(1, Math.ceil(filasOrdenadas.length / PAGE_SIZE))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const filasPagina = useMemo(() => {
    const start = (paginaSegura - 1) * PAGE_SIZE
    return filasOrdenadas.slice(start, start + PAGE_SIZE)
  }, [filasOrdenadas, paginaSegura])

  const kpis = useMemo(() => {
    const total = filtrados.length
    const porEmpresa = new Map<string, number>()
    const porServicio = new Map<string, number>()
    for (const r of filtrados) {
      const emp = r.empresa.trim() || '(sin empresa)'
      porEmpresa.set(emp, (porEmpresa.get(emp) ?? 0) + 1)
      if (SERVICIOS_COMEDOR_PRINCIPALES.includes(r.servicio)) {
        porServicio.set(r.servicio, (porServicio.get(r.servicio) ?? 0) + 1)
      }
    }
    const topEmp = maxPorClave(porEmpresa)
    let servicioPico = '—'
    let servicioPicoN = 0
    for (const s of SERVICIOS_COMEDOR_PRINCIPALES) {
      const n = porServicio.get(s) ?? 0
      if (n > servicioPicoN) {
        servicioPicoN = n
        servicioPico = s
      }
    }
    return {
      total,
      empresaTop: topEmp.clave,
      empresaTopN: topEmp.n,
      servicioPicoLabel:
        servicioPicoN > 0
          ? `${servicioPico}: ${servicioPicoN.toLocaleString('es-AR')}`
          : '—',
    }
  }, [filtrados])

  function exportarExcel() {
    if (!rangoValido) {
      showToast('Indicá un rango de fechas válido.', 'error')
      return
    }
    if (!filasOrdenadas.length) {
      showToast('No hay datos para exportar con los filtros actuales.', 'error')
      return
    }
    const header = [
      'Fecha y Hora',
      'DNI',
      'Nombre',
      'Apellido',
      'Empresa',
      'Servicio',
      'Día operativo',
      'Usuario / dispositivo',
    ]
    const dataRows = filasOrdenadas.map((r) => [
      formatFechaHora(r.fechaHora),
      r.dni,
      r.nombre,
      r.apellido,
      r.empresa,
      etiquetaServicioComedor(r.servicio),
      r.diaOperativo,
      r.usuarioRegistro,
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comensales')
    const sufijoEmpresa = empresaFiltro ? `_${empresaFiltro.replace(/\s+/g, '_')}` : ''
    const sufijoServ = servicioFiltro !== 'TODOS' ? `_${servicioFiltro}` : ''
    XLSX.writeFile(
      wb,
      `control_comensales_${desde}_${hasta}${sufijoEmpresa}${sufijoServ}.xlsx`,
    )
    showToast('Reporte Excel generado.', 'success')
  }

  return (
    <div className="min-h-full w-full bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="border-b border-neutral-100 pb-5">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Control de comensales
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Auditoría de accesos al comedor según registros de la terminal. Filtrá por período
              (día operativo), empresa y servicio. Usá rangos acotados, por ejemplo un mes, para
              cargar más rápido.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Desde <span className="text-[#CD1818]">*</span>
                </span>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Hasta <span className="text-[#CD1818]">*</span>
                </span>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="mt-1 block min-h-11 min-w-[11rem] rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                />
              </label>
              <label className="block min-w-[12rem]">
                <span className="text-xs font-medium text-neutral-600">Empresa</span>
                <select
                  value={empresaFiltro}
                  onChange={(e) => setEmpresaFiltro(e.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                >
                  <option value="">Todas las empresas</option>
                  {empresasOpciones.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-[10rem]">
                <span className="text-xs font-medium text-neutral-600">Servicio</span>
                <select
                  value={servicioFiltro}
                  onChange={(e) => setServicioFiltro(e.target.value as FiltroServicio)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                >
                  <option value="TODOS">Todos</option>
                  <option value="DESAYUNO">Desayuno</option>
                  <option value="ALMUERZO">Almuerzo</option>
                  <option value="MERIENDA">Merienda</option>
                  <option value="CENA">Cena</option>
                  <option value="CENA_NOCHERO">Cena nochera</option>
                  <option value="FUERA DE HORARIO">Fuera de horario</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={exportarExcel}
              disabled={!rangoValido || !filasOrdenadas.length || cargando}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Exportar reporte
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
                <p className="text-3xl font-bold tabular-nums text-gray-900">
                  {cargando ? '…' : kpis.total.toLocaleString('es-AR')}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Total servicios servidos</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Registros en el rango y filtros seleccionados.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-900">
                  {cargando ? '…' : kpis.total > 0 ? kpis.empresaTopN.toLocaleString('es-AR') : '—'}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Mayor consumidor</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-gray-900"
                  title={kpis.empresaTop !== '—' ? kpis.empresaTop : undefined}
                >
                  {kpis.total > 0 ? kpis.empresaTop : 'Sin datos en el período'}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold tabular-nums text-gray-900">
                  {cargando ? '…' : kpis.servicioPicoLabel}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Servicio pico</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Mayor volumen entre desayuno, almuerzo, merienda y cena.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-100">
            <div className="max-h-[min(55vh,560px)] overflow-auto">
              <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Fecha y hora</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Nombre y apellido</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Servicio</th>
                    <th className="px-4 py-3">Dispositivo / usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                  {!rangoValido ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                        Completá las fechas Desde y Hasta.
                      </td>
                    </tr>
                  ) : cargando ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                        Cargando registros del período…
                      </td>
                    </tr>
                  ) : filasPagina.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                        No hay registros con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filasPagina.map((r) => (
                      <tr key={r.id} className="hover:bg-neutral-50/80">
                        <td className="px-4 py-3 tabular-nums text-neutral-700">
                          {formatFechaHora(r.fechaHora)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{r.dni}</td>
                        <td className="px-4 py-3 font-medium">
                          {r.apellido}, {r.nombre}
                        </td>
                        <td className="px-4 py-3">{r.empresa || '—'}</td>
                        <td className="px-4 py-3">{etiquetaServicioComedor(r.servicio)}</td>
                        <td
                          className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-neutral-500"
                          title={r.usuarioRegistro}
                        >
                          {truncarUid(r.usuarioRegistro)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {rangoValido && !cargando && filasOrdenadas.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/80 px-4 py-3">
                <p className="text-xs text-neutral-600">
                  Mostrando {(paginaSegura - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginaSegura * PAGE_SIZE, filasOrdenadas.length)} de{' '}
                  {filasOrdenadas.length.toLocaleString('es-AR')} registros
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={paginaSegura <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs tabular-nums text-neutral-600">
                    Pág. {paginaSegura} / {totalPaginas}
                  </span>
                  <button
                    type="button"
                    disabled={paginaSegura >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
