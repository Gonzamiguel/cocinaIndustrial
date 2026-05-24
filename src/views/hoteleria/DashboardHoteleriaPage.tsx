import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { AjusteEstadiaModal, toDatetimeLocalValue } from '../../components/hoteleria/AjusteEstadiaModal'
import { useToast } from '../../context/ToastContext'
import type { RegistroAjusteEstadia } from '../../types/ajusteEstadia'
import type { Cama, HistorialPernocte, PadronPersona } from '../../types/hoteleria'
import {
  calcularKpisHoteleria,
  filasCuadrillaEstancia,
  filasMovimientosHoteleria,
  type FilaMovimientoHoteleria,
  type FiltrosHoteleriaDashboard,
} from '../../lib/hoteleriaDashboard'
import { exportarHoteleriaExcel } from '../../lib/hoteleriaExcelExport'
import {
  actualizarAjusteManualPernocte,
  crearAjusteManualPernocte,
  egresoProgramadoVencido,
  eliminarAjusteManualPernocte,
  procesarEgresosProgramadosCamas,
  resolverCamaIdPorTexto,
  subscribeCamas,
  subscribeHistorialPernoctes,
  subscribePadronPersonas,
} from '../../lib/hoteleria'

const PAGE_SIZE_MOV = 10
const PAGE_SIZE_CUAD = 20
const MAX_DIAS_VISTA_CUADRILLA = 31

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

function etiquetaDiaColumna(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}

function parseDatetimeLocal(s: string): Date | null {
  if (!s.trim()) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function registroDesdeMovimiento(
  m: FilaMovimientoHoteleria,
  padronPorId: Map<string, PadronPersona>,
): RegistroAjusteEstadia {
  return {
    historialId: m.historialId,
    personaId: m.personaId,
    persona: padronPorId.get(m.personaId) ?? null,
    fechaCheckIn: toDatetimeLocalValue(m.fechaCheckIn) || toDatetimeLocalValue(new Date()),
    fechaCheckOut: toDatetimeLocalValue(m.fechaCheckOut),
    habitacionCama: m.habitacionCama,
    camaId: m.camaId,
  }
}

const KPI_CARDS: { key: keyof ReturnType<typeof calcularKpisHoteleria>; titulo: string; subtitulo?: string }[] = [
  { key: 'poblacionActual', titulo: 'Población actual (POB)', subtitulo: 'Check-in activo hoy' },
  { key: 'totalCheckIns', titulo: 'Total check-ins', subtitulo: 'Ingresos en el período' },
  { key: 'totalCheckOuts', titulo: 'Total check-outs', subtitulo: 'Egresos en el período' },
  { key: 'camasLibres', titulo: 'Disponibilidad', subtitulo: 'Camas libres / total' },
]

function KpiTarjeta({
  titulo,
  valor,
  subtitulo,
  cargando,
}: {
  titulo: string
  valor: string
  subtitulo?: string
  cargando: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1 bg-[#CD1818]" aria-hidden />
      <p className="pl-2 text-xs font-bold uppercase tracking-wide text-[#8997A6]">{titulo}</p>
      <p className="mt-2 pl-2 text-2xl font-black tabular-nums text-gray-800">
        {cargando ? '…' : valor}
      </p>
      {subtitulo ? (
        <p className="mt-1 pl-2 text-xs text-neutral-400">{subtitulo}</p>
      ) : null}
    </div>
  )
}

function claseCeldaEstancia(v: string): string {
  if (v === '1') return 'font-bold text-emerald-600'
  if (v === 'S') return 'font-black text-amber-500'
  return 'font-medium text-gray-300'
}

export function DashboardHoteleriaPage() {
  const { showToast } = useToast()
  const [historial, setHistorial] = useState<HistorialPernocte[]>([])
  const [padron, setPadron] = useState<PadronPersona[]>([])
  const [camas, setCamas] = useState<Cama[]>([])
  const [cargando, setCargando] = useState(true)
  const [desde, setDesde] = useState(primerDiaMesYmd())
  const [hasta, setHasta] = useState(hoyYmdLocal())
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [sectorFiltro, setSectorFiltro] = useState('')
  const [paginaMov, setPaginaMov] = useState(1)
  const [paginaCuad, setPaginaCuad] = useState(1)
  const [exportando, setExportando] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [registroSeleccionado, setRegistroSeleccionado] = useState<RegistroAjusteEstadia | null>(
    null,
  )
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)
  const procesandoEgresosAutoRef = useRef(false)

  useEffect(() => {
    setCargando(true)
    let listos = 0
    const marcar = () => {
      listos++
      if (listos >= 3) setCargando(false)
    }
    const u1 = subscribeHistorialPernoctes((rows) => {
      setHistorial(rows)
      marcar()
    })
    const u2 = subscribePadronPersonas((rows) => {
      setPadron(rows)
      marcar()
    })
    const u3 = subscribeCamas((rows) => {
      setCamas(rows)
      marcar()
    })
    return () => {
      u1()
      u2()
      u3()
    }
  }, [])

  useEffect(() => {
    const hayVencidas = camas.some(
      (c) => c.estado === 'OCUPADA' && egresoProgramadoVencido(c.fechaSalidaEstimada),
    )
    if (!hayVencidas || procesandoEgresosAutoRef.current) return

    procesandoEgresosAutoRef.current = true
    void procesarEgresosProgramadosCamas(camas)
      .then((n) => {
        if (n > 0) {
          showToast(
            n === 1
              ? '1 egreso automático por fecha de check-out programada.'
              : `${n} egresos automáticos por fecha de check-out programada.`,
            'info',
          )
        }
      })
      .finally(() => {
        procesandoEgresosAutoRef.current = false
      })
  }, [camas, showToast])

  useEffect(() => {
    setPaginaMov(1)
    setPaginaCuad(1)
  }, [desde, hasta, empresaFiltro, sectorFiltro])

  const rangoValido = useMemo(() => Boolean(desde && hasta && desde <= hasta), [desde, hasta])

  const padronPorId = useMemo(() => {
    const m = new Map<string, PadronPersona>()
    for (const p of padron) m.set(p.id, p)
    return m
  }, [padron])

  const camaPorId = useMemo(() => {
    const m = new Map<string, Cama>()
    for (const c of camas) m.set(c.id, c)
    return m
  }, [camas])

  const filtros: FiltrosHoteleriaDashboard = useMemo(
    () => ({
      desdeYmd: desde,
      hastaYmd: hasta,
      empresa: empresaFiltro,
      sector: sectorFiltro,
    }),
    [desde, hasta, empresaFiltro, sectorFiltro],
  )

  const empresasOpciones = useMemo(() => {
    const set = new Set<string>()
    for (const p of padron) {
      const e = p.empresa.trim()
      if (e) set.add(e)
    }
    for (const h of historial) {
      const e = h.empresa.trim()
      if (e) set.add(e)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [padron, historial])

  const sectoresOpciones = useMemo(() => {
    const set = new Set<string>()
    for (const c of camas) {
      const s = c.sector.trim()
      if (s) set.add(s)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
  }, [camas])

  const kpis = useMemo(() => {
    if (!rangoValido) {
      return {
        poblacionActual: 0,
        totalCheckIns: 0,
        totalCheckOuts: 0,
        camasLibres: 0,
        camasTotales: 0,
      }
    }
    return calcularKpisHoteleria({
      historial,
      camas,
      padronPorId,
      camaPorId,
      filtros,
    })
  }, [historial, camas, padronPorId, camaPorId, filtros, rangoValido])

  const movimientos = useMemo(() => {
    if (!rangoValido) return []
    return filasMovimientosHoteleria({
      historial,
      padronPorId,
      camaPorId,
      filtros,
    })
  }, [historial, padronPorId, camaPorId, filtros, rangoValido])

  const cuadrilla = useMemo(() => {
    if (!rangoValido) return { dias: [] as string[], filas: [] }
    return filasCuadrillaEstancia({
      historial,
      padronPorId,
      camaPorId,
      filtros,
    })
  }, [historial, padronPorId, camaPorId, filtros, rangoValido])

  const diasDelRango = cuadrilla.dias
  const diasRender = useMemo(
    () =>
      diasDelRango.length > MAX_DIAS_VISTA_CUADRILLA
        ? diasDelRango.slice(0, MAX_DIAS_VISTA_CUADRILLA)
        : diasDelRango,
    [diasDelRango],
  )
  const cuadrillaVistaRecortada = diasDelRango.length > MAX_DIAS_VISTA_CUADRILLA

  const totalPaginasCuad = Math.max(1, Math.ceil(cuadrilla.filas.length / PAGE_SIZE_CUAD))
  const paginaCuadSegura = Math.min(paginaCuad, totalPaginasCuad)
  const filasCuadrillaPagina = useMemo(() => {
    const start = (paginaCuadSegura - 1) * PAGE_SIZE_CUAD
    return cuadrilla.filas.slice(start, start + PAGE_SIZE_CUAD)
  }, [cuadrilla.filas, paginaCuadSegura])

  useEffect(() => {
    if (paginaCuad > totalPaginasCuad) setPaginaCuad(totalPaginasCuad)
  }, [paginaCuad, totalPaginasCuad])

  const totalPaginasMov = Math.max(1, Math.ceil(movimientos.length / PAGE_SIZE_MOV))
  const paginaMovSegura = Math.min(paginaMov, totalPaginasMov)
  const movimientosPagina = useMemo(() => {
    const start = (paginaMovSegura - 1) * PAGE_SIZE_MOV
    return movimientos.slice(start, start + PAGE_SIZE_MOV)
  }, [movimientos, paginaMovSegura])

  function limpiarFiltros() {
    setDesde(primerDiaMesYmd())
    setHasta(hoyYmdLocal())
    setEmpresaFiltro('')
    setSectorFiltro('')
  }

  async function handleExportExcel() {
    if (!rangoValido) {
      showToast('Indicá un rango de fechas válido.', 'error')
      return
    }
    if (!movimientos.length && !cuadrilla.filas.length) {
      showToast('No hay datos para exportar con los filtros actuales.', 'error')
      return
    }
    setExportando(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const fechaArchivo = hasta || hoyYmdLocal()
      await exportarHoteleriaExcel({
        movimientos,
        cuadrilla,
        etiquetaDiaColumna,
        formatFechaHora,
        nombreArchivo: `Hoteleria_Export_${fechaArchivo}.xlsx`,
      })
      showToast(
        `Excel generado: ${movimientos.length.toLocaleString('es-AR')} movimientos, ${cuadrilla.filas.length.toLocaleString('es-AR')} personas en cuadrilla.`,
        'success',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo exportar el Excel.', 'error')
    } finally {
      setExportando(false)
    }
  }

  function abrirModalNuevoAjuste() {
    setRegistroSeleccionado(null)
    setIsModalOpen(true)
  }

  function abrirModalEditar(m: FilaMovimientoHoteleria) {
    setRegistroSeleccionado(registroDesdeMovimiento(m, padronPorId))
    setIsModalOpen(true)
  }

  function cerrarModalAjuste() {
    if (guardandoAjuste) return
    setIsModalOpen(false)
    setRegistroSeleccionado(null)
  }

  async function handleGuardarAjuste(payload: RegistroAjusteEstadia) {
    const checkIn = parseDatetimeLocal(payload.fechaCheckIn)
    if (!checkIn) {
      showToast('Fecha de ingreso inválida.', 'error')
      return
    }
    const checkOut = parseDatetimeLocal(payload.fechaCheckOut)
    if (!checkOut) {
      showToast('Indicá la fecha de egreso planificada.', 'error')
      return
    }
    const camaIdResuelto =
      payload.camaId.trim() || resolverCamaIdPorTexto(payload.habitacionCama, camas)
    if (!camaIdResuelto) {
      showToast('Seleccioná una habitación / cama válida del listado.', 'error')
      return
    }

    setGuardandoAjuste(true)
    try {
      if (payload.historialId) {
        await actualizarAjusteManualPernocte({
          historialId: payload.historialId,
          personaId: payload.personaId,
          camaId: camaIdResuelto,
          fechaCheckIn: checkIn,
          fechaCheckOut: checkOut,
        })
        showToast('Estadía actualizada.', 'success')
      } else {
        await crearAjusteManualPernocte({
          personaId: payload.personaId,
          camaId: camaIdResuelto,
          fechaCheckIn: checkIn,
          fechaCheckOut: checkOut,
        })
        showToast('Estadía registrada.', 'success')
      }
      setIsModalOpen(false)
      setRegistroSeleccionado(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar el ajuste.', 'error')
    } finally {
      setGuardandoAjuste(false)
    }
  }

  async function handleEliminarAjuste(m: FilaMovimientoHoteleria) {
    if (
      !window.confirm(
        '¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.',
      )
    ) {
      return
    }
    try {
      await eliminarAjusteManualPernocte(m.historialId)
      showToast('Registro eliminado.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    }
  }

  function valorKpi(key: (typeof KPI_CARDS)[number]['key']): string {
    if (key === 'camasLibres') {
      return kpis.camasTotales > 0
        ? `${kpis.camasLibres.toLocaleString('es-AR')} / ${kpis.camasTotales.toLocaleString('es-AR')}`
        : '—'
    }
    return kpis[key].toLocaleString('es-AR')
  }

  return (
    <div className="min-h-full w-full bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="border-b border-neutral-100 pb-5">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Control de hotelería
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Pernoctes, ocupación por cuadrilla y movimientos de personas. Filtrá por período,
              empresa y campamento (sector).
            </p>
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
              <label className="block min-w-[12rem]">
                <span className="text-xs font-medium text-neutral-600">Campamento / sitio</span>
                <select
                  value={sectorFiltro}
                  onChange={(e) => setSectorFiltro(e.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                >
                  <option value="">Todos los sectores</option>
                  {sectoresOpciones.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
                onClick={abrirModalNuevoAjuste}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                Ajustar estadía
              </button>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={
                  !rangoValido ||
                  cargando ||
                  exportando ||
                  (!movimientos.length && !cuadrilla.filas.length)
                }
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
            <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {KPI_CARDS.map(({ key, titulo, subtitulo }) => (
                <KpiTarjeta
                  key={key}
                  titulo={titulo}
                  valor={valorKpi(key)}
                  subtitulo={subtitulo}
                  cargando={cargando}
                />
              ))}
            </div>
          ) : null}

          {rangoValido ? (
            <div className="mt-8">
              <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                Historial cronológico de check-in, check-out y cambios de habitación.
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-neutral-100">
                <div className="overflow-auto">
                  <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      <tr>
                        <th className="px-4 py-3">Fecha y hora</th>
                        <th className="px-4 py-3">DNI</th>
                        <th className="px-4 py-3">Persona</th>
                        <th className="px-4 py-3">Empresa</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Habitación / cama</th>
                        <th className="w-24 px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                      {cargando ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                            Cargando movimientos…
                          </td>
                        </tr>
                      ) : movimientosPagina.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                            No hay movimientos en el período seleccionado.
                          </td>
                        </tr>
                      ) : (
                        movimientosPagina.map((m) => (
                          <tr key={m.id} className="hover:bg-neutral-50/80">
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-700">
                              {formatFechaHora(m.fechaHora)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{m.dni}</td>
                            <td className="px-4 py-3 font-medium">{m.persona}</td>
                            <td className="px-4 py-3">{m.empresa}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${
                                  m.tipo === 'Check-in'
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : m.tipo === 'Check-out'
                                      ? 'bg-neutral-100 text-neutral-700'
                                      : 'bg-[#CD1818]/10 text-[#CD1818]'
                                }`}
                              >
                                {m.tipo}
                              </span>
                            </td>
                            <td className="max-w-[16rem] truncate px-4 py-3 text-xs text-neutral-600" title={m.habitacionCama}>
                              {m.habitacionCama}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="inline-flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => abrirModalEditar(m)}
                                  aria-label={`Editar estadía de ${m.persona}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-[#CD1818]/10 hover:text-[#CD1818]"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleEliminarAjuste(m)}
                                  aria-label={`Eliminar estadía de ${m.persona}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {!cargando && movimientos.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/80 px-4 py-3">
                    <p className="text-xs text-neutral-600">
                      Mostrando {(paginaMovSegura - 1) * PAGE_SIZE_MOV + 1}–
                      {Math.min(paginaMovSegura * PAGE_SIZE_MOV, movimientos.length)} de{' '}
                      {movimientos.length.toLocaleString('es-AR')} movimientos
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paginaMovSegura <= 1}
                        onClick={() => setPaginaMov((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <span className="text-xs tabular-nums text-neutral-600">
                        Pág. {paginaMovSegura} / {totalPaginasMov}
                      </span>
                      <button
                        type="button"
                        disabled={paginaMovSegura >= totalPaginasMov}
                        onClick={() => setPaginaMov((p) => Math.min(totalPaginasMov, p + 1))}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {rangoValido ? (
            <div className="mt-10">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Control de estancia</h2>
                  <p className="mt-0.5 text-xs text-[#8997A6]">
                    Cuadrilla por persona: 1 = pernocte · S = día de salida · 0 = ausente
                  </p>
                </div>
                <p className="text-xs text-neutral-500">
                  {cuadrilla.filas.length.toLocaleString('es-AR')} personas ·{' '}
                  {diasDelRango.length} días
                  {cuadrillaVistaRecortada
                    ? ` (vista: ${diasRender.length} días)`
                    : null}
                </p>
              </div>
              {cuadrillaVistaRecortada ? (
                <div
                  role="status"
                  className="mb-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>
                    El rango seleccionado supera los 31 días. Por rendimiento, esta vista previa solo
                    muestra el primer mes. Utilice el botón [Exportar a Excel] para ver y analizar la
                    cuadrilla completa.
                  </p>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-neutral-100">
                <table className="min-w-max divide-y divide-neutral-100 text-left text-sm">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[6.5rem] bg-neutral-50 px-3 py-2.5">
                        DNI
                      </th>
                      <th className="sticky left-[6.5rem] z-20 min-w-[8rem] bg-neutral-50 px-3 py-2.5">
                        Empresa
                      </th>
                      <th className="sticky left-[14.5rem] z-20 min-w-[7rem] bg-neutral-50 px-3 py-2.5">
                        Nombre
                      </th>
                      <th className="sticky left-[21.5rem] z-20 min-w-[7rem] border-r border-neutral-200 bg-neutral-50 px-3 py-2.5 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        Apellido
                      </th>
                      {diasRender.map((ymd) => (
                        <th
                          key={ymd}
                          className="min-w-[2.25rem] px-1 py-2.5 text-center font-mono text-[10px] normal-case"
                          title={ymd}
                        >
                          {etiquetaDiaColumna(ymd)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                    {cargando ? (
                      <tr>
                        <td
                          colSpan={4 + diasRender.length}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          Cargando datos de hotelería…
                        </td>
                      </tr>
                    ) : cuadrilla.filas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4 + Math.max(diasRender.length, 1)}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          No hay pernoctes en el rango y filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filasCuadrillaPagina.map((f) => (
                        <tr key={`${f.personaId}-${f.dni}`} className="hover:bg-neutral-50/60">
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-mono text-[11px]">
                            {f.dni}
                          </td>
                          <td className="sticky left-[6.5rem] z-10 max-w-[8rem] truncate bg-white px-3 py-1.5 text-xs">
                            {f.empresa}
                          </td>
                          <td className="sticky left-[14.5rem] z-10 bg-white px-3 py-1.5 text-xs">
                            {f.nombre}
                          </td>
                          <td className="sticky left-[21.5rem] z-10 border-r border-neutral-100 bg-white px-3 py-1.5 text-xs font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                            {f.apellido}
                          </td>
                          {diasRender.map((ymd) => {
                            const v = f.nochesPorDia[ymd] ?? '0'
                            return (
                              <td key={ymd} className="px-0.5 py-1 text-center">
                                <span
                                  className={`inline-flex h-7 w-7 items-center justify-center text-xs tabular-nums ${claseCeldaEstancia(v)}`}
                                >
                                  {v}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {!cargando && cuadrilla.filas.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/80 px-4 py-3">
                    <p className="text-xs text-neutral-600">
                      Mostrando {(paginaCuadSegura - 1) * PAGE_SIZE_CUAD + 1}–
                      {Math.min(paginaCuadSegura * PAGE_SIZE_CUAD, cuadrilla.filas.length)} de{' '}
                      {cuadrilla.filas.length.toLocaleString('es-AR')} personas
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paginaCuadSegura <= 1}
                        onClick={() => setPaginaCuad((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <span className="text-xs tabular-nums text-neutral-600">
                        Pág. {paginaCuadSegura} / {totalPaginasCuad}
                      </span>
                      <button
                        type="button"
                        disabled={paginaCuadSegura >= totalPaginasCuad}
                        onClick={() => setPaginaCuad((p) => Math.min(totalPaginasCuad, p + 1))}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-600">
                <span>🟩 1: Pernocte facturable.</span>
                <span>
                  🟧 S: Día de salida / tránsito (justifica consumos en comedor, libera cama).
                </span>
                <span>⬜ 0: Ausente.</span>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <AjusteEstadiaModal
        open={isModalOpen}
        registro={registroSeleccionado}
        padron={padron}
        camas={camas}
        onClose={cerrarModalAjuste}
        onSave={(payload) => void handleGuardarAjuste(payload)}
        saving={guardandoAjuste}
      />
    </div>
  )
}
