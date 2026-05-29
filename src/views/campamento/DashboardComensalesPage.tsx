import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import type { PadronPersona } from '../../types/hoteleria'
import type { RegistroComedor, ServicioComedor } from '../../types/comedor'
import { SERVICIOS_COMEDOR_FORZABLES } from '../../types/comedor'
import {
  buscarPersonaPadronPorDni,
  crearRegistroComedorRetroactivoSupervisor,
  subscribeRegistrosComedorPorRango,
} from '../../lib/comedor'
import {
  esRegistroViandaComedor,
  etiquetaServicioComedor,
  OPCIONES_FILTRO_SERVICIO_COMENSALES,
  registroCoincideFiltroServicioComensales,
} from '../../lib/servicioComedor'
import type { FiltroServicioComensales } from '../../lib/servicioComedor'

const PAGE_SIZE = 40

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

function truncarUid(uid: string): string {
  const u = uid.trim()
  if (u.length <= 12) return u
  return `${u.slice(0, 8)}…${u.slice(-4)}`
}

type ConteosServiciosKpi = {
  desayuno: number
  almuerzo: number
  refrigerioAlmuerzo: number
  merienda: number
  cena: number
  cenaNochero: number
  refrigerioNochero: number
  viandas: number
}

const TARJETAS_KPI_SERVICIO: { key: keyof ConteosServiciosKpi; titulo: string }[] = [
  { key: 'desayuno', titulo: 'Desayuno' },
  { key: 'almuerzo', titulo: 'Almuerzo' },
  { key: 'refrigerioAlmuerzo', titulo: 'Refrigerio almuerzo' },
  { key: 'merienda', titulo: 'Merienda' },
  { key: 'cena', titulo: 'Cena' },
  { key: 'cenaNochero', titulo: 'Cena (nochero)' },
  { key: 'refrigerioNochero', titulo: 'Refrigerio (nochero)' },
  { key: 'viandas', titulo: 'Viandas' },
]

function KpiTarjetaServicio({
  titulo,
  valor,
  cargando,
}: {
  titulo: string
  valor: number
  cargando: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1 bg-[#CD1818]" aria-hidden />
      <p className="pl-2 text-xs font-bold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-2 pl-2 text-2xl font-black tabular-nums text-gray-800">
        {cargando ? '…' : valor.toLocaleString('es-AR')}
      </p>
    </div>
  )
}

export function DashboardComensalesPage() {
  const { showToast } = useToast()
  const [registros, setRegistros] = useState<RegistroComedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [servicioFiltro, setServicioFiltro] = useState<FiltroServicioComensales>('TODOS')
  const [pagina, setPagina] = useState(1)

  const [modalRetroAbierto, setModalRetroAbierto] = useState(false)
  const [retroDni, setRetroDni] = useState('')
  const [retroFechaOperativa, setRetroFechaOperativa] = useState(() => hoyYmdLocal())
  const [retroServicio, setRetroServicio] = useState<ServicioComedor>('ALMUERZO')
  const [retroObservaciones, setRetroObservaciones] = useState('')
  const [retroPersona, setRetroPersona] = useState<PadronPersona | null>(null)
  const [retroBuscando, setRetroBuscando] = useState(false)
  const [retroGuardando, setRetroGuardando] = useState(false)
  const [exportando, setExportando] = useState(false)

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

  function abrirModalRetro() {
    setRetroDni('')
    setRetroFechaOperativa(hoyYmdLocal())
    setRetroServicio('ALMUERZO')
    setRetroObservaciones('')
    setRetroPersona(null)
    setModalRetroAbierto(true)
  }

  function cerrarModalRetro() {
    setModalRetroAbierto(false)
  }

  async function buscarRetroPadron() {
    const d = retroDni.trim().toUpperCase()
    if (!d) {
      showToast('Ingresá un DNI.', 'error')
      return
    }
    setRetroBuscando(true)
    setRetroPersona(null)
    try {
      const p = await buscarPersonaPadronPorDni(d)
      if (!p) {
        showToast('No se encontró en el padrón.', 'error')
        return
      }
      setRetroPersona(p)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al consultar el padrón.', 'error')
    } finally {
      setRetroBuscando(false)
    }
  }

  async function guardarRetroManual() {
    if (!retroPersona) {
      showToast('Buscá la persona en el padrón antes de guardar.', 'error')
      return
    }
    const obs = retroObservaciones.trim()
    if (!obs) {
      showToast('Completá observaciones / motivo.', 'error')
      return
    }
    const ymd = retroFechaOperativa.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      showToast('Fecha operativa inválida.', 'error')
      return
    }
    setRetroGuardando(true)
    try {
      await crearRegistroComedorRetroactivoSupervisor({
        persona: retroPersona,
        servicio: retroServicio,
        diaOperativo: ymd,
        observaciones: obs,
        registrosLocales: registros,
      })
      const fueraDeGrilla = ymd < desde || ymd > hasta
      showToast(
        fueraDeGrilla
          ? 'Registro manual guardado. Ajustá Desde / Hasta para verlo en la grilla (fecha fuera del rango actual).'
          : 'Registro manual guardado.',
        'success',
      )
      cerrarModalRetro()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setRetroGuardando(false)
    }
  }

  function limpiarFiltros() {
    setDesde(primerDiaMesYmd())
    setHasta(hoyYmdLocal())
    setEmpresaFiltro('')
    setServicioFiltro('TODOS')
  }

  const empresasOpciones = useMemo(() => {
    const set = new Set<string>()
    for (const r of registros) {
      const e = r.empresa.trim()
      if (e) set.add(e)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [registros])

  const filtrados = useMemo(() => {
    if (!rangoValido) return []
    return registros.filter((r) => {
      if (empresaFiltro && r.empresa.trim() !== empresaFiltro) return false
      return registroCoincideFiltroServicioComensales(r, servicioFiltro)
    })
  }, [registros, empresaFiltro, servicioFiltro, rangoValido])

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

  const conteosPorServicio = useMemo((): ConteosServiciosKpi => {
    const c: ConteosServiciosKpi = {
      desayuno: 0,
      almuerzo: 0,
      refrigerioAlmuerzo: 0,
      merienda: 0,
      cena: 0,
      cenaNochero: 0,
      refrigerioNochero: 0,
      viandas: 0,
    }
    for (const r of filtrados) {
      switch (r.servicio) {
        case 'DESAYUNO':
          c.desayuno++
          break
        case 'ALMUERZO':
          c.almuerzo++
          break
        case 'MERIENDA':
          if (esRegistroViandaComedor(r)) c.viandas++
          else c.merienda++
          break
        case 'CENA':
          c.cena++
          break
        case 'CENA_NOCHERO':
          c.cenaNochero++
          break
        default:
          break
      }
    }
    // Regla de negocio: refrigerio almuerzo / nochero = mismo conteo que el servicio principal.
    c.refrigerioAlmuerzo = c.almuerzo
    c.refrigerioNochero = c.cenaNochero
    return c
  }, [filtrados])

  async function handleExportExcel() {
    if (!rangoValido) {
      showToast('Indicá un rango de fechas válido.', 'error')
      return
    }
    if (!filasOrdenadas.length) {
      showToast('No hay datos para exportar con los filtros actuales.', 'error')
      return
    }
    setExportando(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const header = ['Fecha', 'DNI', 'Nombre', 'Apellido', 'Empresa', 'Servicio', 'Día operativo']
      const dataRows = filasOrdenadas.map((r) => [
        formatFechaHora(r.fechaHora),
        r.dni,
        r.nombre,
        r.apellido,
        r.empresa,
        etiquetaServicioComedor(r.servicio),
        r.diaOperativo,
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Registros')
      const fechaArchivo = hasta || hoyYmdLocal()
      XLSX.writeFile(wb, `Comensales_Export_${fechaArchivo}.xlsx`)
      showToast(
        `Excel generado (${filasOrdenadas.length.toLocaleString('es-AR')} registros filtrados).`,
        'success',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo exportar el Excel.', 'error')
    } finally {
      setExportando(false)
    }
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
            <button
              type="button"
              onClick={abrirModalRetro}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#CD1818]/40 bg-[#CD1818]/5 px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-[#CD1818]/10"
            >
              + Agregar Registro Manual (Retroactivo)
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-4">
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
                  onChange={(e) => setServicioFiltro(e.target.value as FiltroServicioComensales)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                >
                  {OPCIONES_FILTRO_SERVICIO_COMENSALES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
              >
                Limpiar filtro
              </button>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={!rangoValido || !filasOrdenadas.length || cargando || exportando}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {exportando ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                )}
                Excel
              </button>
          </div>

          {!rangoValido && desde && hasta ? (
            <p className="mt-4 text-sm text-red-600">
              La fecha &quot;Desde&quot; no puede ser posterior a &quot;Hasta&quot;.
            </p>
          ) : null}

          {rangoValido ? (
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              {TARJETAS_KPI_SERVICIO.map(({ key, titulo }) => (
                <KpiTarjetaServicio
                  key={key}
                  titulo={titulo}
                  valor={conteosPorServicio[key]}
                  cargando={cargando}
                />
              ))}
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
                    <th className="px-4 py-3">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                  {!rangoValido ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                        Completá las fechas Desde y Hasta.
                      </td>
                    </tr>
                  ) : cargando ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                        Cargando registros del período…
                      </td>
                    </tr>
                  ) : filasPagina.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
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
                        <td
                          className="max-w-[14rem] truncate px-4 py-3 text-xs text-neutral-600"
                          title={r.observaciones}
                        >
                          {r.observaciones ?? '—'}
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

        {modalRetroAbierto ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-gray-900">Registro manual (retroactivo)</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Los campos son obligatorios. El registro queda auditado como carga de supervisor.
              </p>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    DNI <span className="text-[#CD1818]">*</span>
                  </span>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      value={retroDni}
                      onChange={(e) => {
                        setRetroDni(e.target.value)
                        setRetroPersona(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void buscarRetroPadron()
                      }}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 font-mono text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                      placeholder="Sin puntos"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={retroBuscando || !retroDni.trim()}
                      onClick={() => void buscarRetroPadron()}
                      className="shrink-0 rounded-xl bg-neutral-800 px-4 text-sm font-semibold text-white disabled:opacity-45"
                    >
                      {retroBuscando ? '…' : 'Validar'}
                    </button>
                  </div>
                </label>
                {retroPersona ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
                    <p className="font-semibold">
                      {retroPersona.apellido}, {retroPersona.nombre}
                    </p>
                    <p className="mt-0.5 font-mono text-xs">DNI {retroPersona.dni}</p>
                    <p className="mt-1 text-emerald-900">{retroPersona.empresa || 'Sin empresa'}</p>
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Fecha operativa <span className="text-[#CD1818]">*</span>
                  </span>
                  <input
                    type="date"
                    value={retroFechaOperativa}
                    onChange={(e) => setRetroFechaOperativa(e.target.value)}
                    className="mt-1 block w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Servicio <span className="text-[#CD1818]">*</span>
                  </span>
                  <select
                    value={retroServicio}
                    onChange={(e) => setRetroServicio(e.target.value as ServicioComedor)}
                    className="mt-1 block w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                  >
                    {SERVICIOS_COMEDOR_FORZABLES.map((s) => (
                      <option key={s} value={s}>
                        {etiquetaServicioComedor(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Observaciones / motivo <span className="text-[#CD1818]">*</span>
                  </span>
                  <textarea
                    value={retroObservaciones}
                    onChange={(e) => setRetroObservaciones(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full resize-y rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                    placeholder="Ej. Llegada tarde de camión, fallo de dispositivo…"
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cerrarModalRetro}
                  disabled={retroGuardando}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-45"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={retroGuardando}
                  onClick={() => void guardarRetroManual()}
                  className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-45"
                >
                  {retroGuardando ? 'Guardando…' : 'Confirmar registro'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
