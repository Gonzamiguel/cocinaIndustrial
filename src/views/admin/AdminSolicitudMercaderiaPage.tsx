import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import { Eye, FileDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { exportarSolicitudMercaderiaResumenPdf } from '../../lib/mercaderiaPdf'
import {
  crearSolicitudMercaderia,
  esTrasladoInterno,
  estiloBadgeEstadoSolicitud,
  solicitudDeUbicacion,
  subscribeSolicitudesMercaderia,
  type ItemSolicitudMercaderia,
  type PrioridadSolicitud,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import {
  escalarIngredientesReceta,
  itemsSolicitudDesdeRecetaEscalada,
} from '../../lib/requisicionDesdeReceta'
import { subscribeRecetario, type RecetaTecnica } from '../../lib/recetario'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

type ModoRequisicion = 'libre' | 'planificada'

type FilaDraft = {
  key: string
  producto: string
  cantidad: string
  unidadMedida: string
  presentacion: string
  observacion: string
  /** Primer insumo del catálogo que coincide con el nombre genérico (egreso desde solicitud). */
  insumoRepresentativoId: string
}

function nuevaFila(): FilaDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    producto: '',
    cantidad: '',
    unidadMedida: '',
    presentacion: '',
    observacion: '',
    insumoRepresentativoId: '',
  }
}

function formatFechaCreacion(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Filtro por fecha de creación (columna «Creación»), inclusive. */
function startOfDayLocal(yyyyMmDd: string): number | null {
  const t = yyyyMmDd.trim()
  if (!t) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return new Date(y, mo - 1, d, 0, 0, 0, 0).getTime()
}

function endOfDayLocal(yyyyMmDd: string): number | null {
  const t = yyyyMmDd.trim()
  if (!t) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return new Date(y, mo - 1, d, 23, 59, 59, 999).getTime()
}

const inputFechaFiltroClass =
  'min-h-9 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

const PRIORIDADES: PrioridadSolicitud[] = ['Normal', 'Alta', 'Urgente']

const PRESENTACIONES_OPCIONES = [
  'Caja',
  'Bolsa/Sacón',
  'Bidón',
  'Lata',
  'Paquete/Pack',
  'Cajón',
  'Atado',
  'Horma',
] as const

const selectInsumoClass =
  'mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

const inputInsumoClass =
  'mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

type OpcionInsumoGenerico = {
  key: string
  nombreGenerico: string
  unidadBase: string
  label: string
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function InsumoGenericoSearchSelect({
  opciones,
  selectedLabel,
  onSelect,
  onClear,
}: {
  opciones: OpcionInsumoGenerico[]
  selectedLabel: string
  onSelect: (option: OpcionInsumoGenerico) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = normalizarTexto(query)
    if (!q) return opciones.slice(0, 80)
    return opciones.filter((option) =>
      normalizarTexto(`${option.nombreGenerico} ${option.unidadBase}`).includes(q),
    )
  }, [opciones, query])

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <span className="text-xs font-medium text-[#8997A6]">
        Artículo genérico
      </span>
      {selectedLabel.trim() ? (
        <div className="mt-2.5 flex flex-wrap items-stretch gap-2">
          <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-[#171717]">
            <span className="line-clamp-2">{selectedLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
              setOpen(false)
            }}
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#8997A6] transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={open ? query : ''}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!open) setOpen(true)
            }}
            onFocus={() => {
              setOpen(true)
              setQuery('')
            }}
            placeholder="Buscar por nombre genérico…"
            className={inputInsumoClass}
            aria-expanded={open}
            aria-controls="insumo-generico-search-listbox"
            aria-autocomplete="list"
          />
          {open ? (
            <ul
              id="insumo-generico-search-listbox"
              role="listbox"
              className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-[#8997A6]">
                  No hay coincidencias.
                </li>
              ) : (
                filtered.map((option) => (
                  <li key={option.key} role="option">
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm text-[#171717] transition hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelect(option)
                        setQuery('')
                        setOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}

export type AdminSolicitudMercaderiaPageProps = {
  /** En pestañas: sin encabezados duplicados ni contenedores extra. */
  variant?: 'standalone' | 'embedded'
  /**
   * Con `variant="embedded"`, el padre puede renderizar el botón «Nueva solicitud» y enlazarlo aquí.
   * Si se define, no se muestra la barra duplicada del botón dentro de este componente.
   */
  nuevaSolicitudRef?: MutableRefObject<(() => void) | null>
  /**
   * Ruta base para ver el detalle en página completa (sin barra final). Ej. `/admin/mercaderia/solicitud`.
   */
  solicitudDetalleBasePath?: string
}

export function AdminSolicitudMercaderiaPage({
  variant = 'standalone',
  nuevaSolicitudRef,
  solicitudDetalleBasePath = '/admin/mercaderia/solicitud',
}: AdminSolicitudMercaderiaPageProps) {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [lista, setLista] = useState<SolicitudMercaderia[]>([])
  const [enviando, setEnviando] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [modoRequisicion, setModoRequisicion] = useState<ModoRequisicion>('libre')
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [recetaPlanId, setRecetaPlanId] = useState('')
  const [porcionesPlanStr, setPorcionesPlanStr] = useState('100')

  const [fechaEntrega, setFechaEntrega] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>('Normal')
  const [filas, setFilas] = useState<FilaDraft[]>(() => [nuevaFila()])
  const [fechaFiltroDesde, setFechaFiltroDesde] = useState('')
  const [fechaFiltroHasta, setFechaFiltroHasta] = useState('')

  useEffect(() => {
    return subscribeSolicitudesMercaderia(setLista)
  }, [])

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    return subscribeRecetario(setRecetas)
  }, [])

  const insumosGenericos = useMemo(() => {
    const map = new Map<string, OpcionInsumoGenerico>()
    for (const insumo of insumos) {
      const nombreGenerico = insumo.nombreGenerico.trim()
      if (!nombreGenerico) continue
      const key = normalizarTexto(nombreGenerico)
      if (map.has(key)) continue
      map.set(key, {
        key,
        nombreGenerico,
        unidadBase: insumo.unidadBase,
        label: `${nombreGenerico} (${insumo.unidadBase})`,
      })
    }
    return [...map.values()].sort((a, b) =>
      a.nombreGenerico.localeCompare(b.nombreGenerico, 'es', {
        sensitivity: 'base',
      }),
    )
  }, [insumos])

  const insumoPorId = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  const recetaPlanSeleccionada = useMemo(
    () => recetas.find((r) => r.id === recetaPlanId) ?? null,
    [recetas, recetaPlanId],
  )

  const previewPlanificada = useMemo(() => {
    if (!recetaPlanSeleccionada) return []
    const n = Number(porcionesPlanStr)
    if (!Number.isFinite(n) || n <= 0) return []
    return escalarIngredientesReceta(recetaPlanSeleccionada, n, insumoPorId)
  }, [recetaPlanSeleccionada, porcionesPlanStr, insumoPorId])

  const recetasOrdenadas = useMemo(
    () =>
      [...recetas].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
      ),
    [recetas],
  )

  function abrirNuevaSolicitud() {
    setModoRequisicion('libre')
    setRecetaPlanId('')
    setPorcionesPlanStr('100')
    setFilas([nuevaFila()])
    setIsCreating(true)
  }

  useEffect(() => {
    if (variant !== 'embedded' || !nuevaSolicitudRef) return
    nuevaSolicitudRef.current = () => abrirNuevaSolicitud()
    return () => {
      nuevaSolicitudRef.current = null
    }
  }, [variant, nuevaSolicitudRef])

  const solicitudesOrdenadas = useMemo(() => {
    const ub = ubicacionId?.trim().toUpperCase() ?? ''
    const deMiUbicacion = lista.filter((s) => {
      if (!esTrasladoInterno(s)) return false
      if (!ub) return true
      return solicitudDeUbicacion(s, ub)
    })
    return [...deMiUbicacion].sort((a, b) => {
      const ta = a.fechaCreacion?.getTime() ?? 0
      const tb = b.fechaCreacion?.getTime() ?? 0
      return tb - ta
    })
  }, [lista, ubicacionId])

  const filtroFechaActivo = Boolean(
    fechaFiltroDesde.trim().length > 0 || fechaFiltroHasta.trim().length > 0,
  )

  const solicitudesFiltradas = useMemo(() => {
    const desdeT = startOfDayLocal(fechaFiltroDesde)
    const hastaT = endOfDayLocal(fechaFiltroHasta)
    if (desdeT == null && hastaT == null) return solicitudesOrdenadas

    return solicitudesOrdenadas.filter((s) => {
      const t = s.fechaCreacion?.getTime()
      if (t == null) return false
      if (desdeT != null && t < desdeT) return false
      if (hastaT != null && t > hastaT) return false
      return true
    })
  }, [solicitudesOrdenadas, fechaFiltroDesde, fechaFiltroHasta])

  function actualizarFila(i: number, parcial: Partial<FilaDraft>) {
    setFilas((prev) =>
      prev.map((f, j) => (j === i ? { ...f, ...parcial } : f)),
    )
  }

  function agregarFila() {
    setFilas((prev) => [...prev, nuevaFila()])
  }

  function quitarFila(i: number) {
    setFilas((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()

    if (!fechaEntrega.trim()) {
      showToast('Indicá la fecha de entrega esperada.', 'error')
      return
    }

    let items: ItemSolicitudMercaderia[] = []

    if (modoRequisicion === 'planificada') {
      if (!recetaPlanSeleccionada) {
        showToast('Seleccioná un plato del recetario.', 'error')
        return
      }
      const porciones = Number(porcionesPlanStr)
      if (!Number.isFinite(porciones) || porciones <= 0) {
        showToast('Indicá la cantidad de porciones a elaborar.', 'error')
        return
      }
      if (previewPlanificada.length === 0) {
        showToast(
          'La receta no tiene ingredientes escalables. Revisá la ficha técnica.',
          'error',
        )
        return
      }
      items = itemsSolicitudDesdeRecetaEscalada(previewPlanificada)
    } else {
      for (const f of filas) {
        const cant = Number(f.cantidad)

        const prod = f.producto.trim()
        if (!prod || !Number.isFinite(cant) || cant <= 0) continue

        const um = f.unidadMedida.trim()
        if (!um) {
          showToast(
            'En cada insumo con producto y cantidad, seleccioná o confirmá la unidad de medida.',
            'error',
          )
          return
        }

        const repId = f.insumoRepresentativoId.trim()
        items.push({
          producto: prod,
          cantidad: cant,
          unidadMedida: um,
          presentacion: f.presentacion.trim(),
          observacion: f.observacion.trim(),
          ...(repId ? { insumoId: repId } : {}),
        })
      }

      if (items.length === 0) {
        showToast('Agregá al menos un insumo con producto y cantidad válidos.', 'error')
        return
      }
    }

    setEnviando(true)
    try {
      await crearSolicitudMercaderia({
        fechaEntregaEsperada: fechaEntrega.trim(),
        prioridad,
        items,
        ubicacionSolicitanteId: ubicacionId,
      })
      showToast(
        modoRequisicion === 'planificada'
          ? 'Requisición planificada enviada al depósito.'
          : 'Solicitud enviada al depósito.',
      )
      setFilas([nuevaFila()])
      setFechaEntrega('')
      setPrioridad('Normal')
      setRecetaPlanId('')
      setPorcionesPlanStr('100')
      setModoRequisicion('libre')
      setIsCreating(false)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo enviar la solicitud.',
        'error',
      )
    } finally {
      setEnviando(false)
    }
  }

  /** Vista historial: tabla a pantalla completa en el área de contenido */
  if (!isCreating) {
    const embedded = variant === 'embedded'
    const toolbarExterno = Boolean(embedded && nuevaSolicitudRef)
    return (
      <div
        className={
          embedded
            ? 'flex min-h-0 flex-1 flex-col'
            : 'flex min-h-full flex-1 flex-col bg-neutral-50'
        }
      >
        {embedded && !toolbarExterno ? (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => abrirNuevaSolicitud()}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#CD1818] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <span className="text-lg leading-none">+</span>
              Nueva solicitud
            </button>
          </div>
        ) : !embedded ? (
          <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                  Solicitar mercadería
                </h1>
              </div>
              <button
                type="button"
                onClick={() => abrirNuevaSolicitud()}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
              >
                <span className="text-xl leading-none">+</span>
                Nueva solicitud
              </button>
            </div>
          </header>
        ) : null}

        <div
          className={
            embedded
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20'
          }
        >
          <div
            className={
              embedded
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm'
                : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'
            }
          >
            {embedded && !toolbarExterno ? (
              <div className="shrink-0 border-b border-neutral-100 px-3 py-2 text-xs text-[#8997A6]">
                {ubicacionId?.trim() ? (
                  <>
                    Solicitudes de{' '}
                    <span className="font-mono text-[11px] text-[#171717]">
                      {ubicacionId.trim().toUpperCase()}
                    </span>
                    {' · '}
                  </>
                ) : null}
                {solicitudesFiltradas.length} registro
                {solicitudesFiltradas.length === 1 ? '' : 's'}
                {filtroFechaActivo &&
                solicitudesFiltradas.length !== solicitudesOrdenadas.length
                  ? ` (de ${solicitudesOrdenadas.length})`
                  : ''}
                {filtroFechaActivo ? ' · filtro por fecha' : ''} · actualización en vivo
              </div>
            ) : !embedded ? (
              <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Historial de solicitudes
                </h2>
                <p className="mt-0.5 text-xs text-[#8997A6]">
                  Solo pedidos al depósito de tu ubicación (traslados internos). Actualización en
                  vivo cuando el depósito cambia el estado u observaciones. Podés acotar por fecha
                  de creación con «Desde» y «Hasta».
                </p>
              </div>
            ) : null}
            <div className="shrink-0 flex flex-wrap items-end gap-3 border-b border-neutral-100 bg-neutral-50/70 px-3 py-3 sm:px-5">
              <label className="flex min-w-[9.5rem] flex-col gap-1">
                <span className="text-xs font-medium text-[#8997A6]">Desde</span>
                <input
                  type="date"
                  value={fechaFiltroDesde}
                  onChange={(e) => setFechaFiltroDesde(e.target.value)}
                  className={inputFechaFiltroClass}
                />
              </label>
              <label className="flex min-w-[9.5rem] flex-col gap-1">
                <span className="text-xs font-medium text-[#8997A6]">Hasta</span>
                <input
                  type="date"
                  value={fechaFiltroHasta}
                  onChange={(e) => setFechaFiltroHasta(e.target.value)}
                  className={inputFechaFiltroClass}
                />
              </label>
              {filtroFechaActivo ? (
                <button
                  type="button"
                  onClick={() => {
                    setFechaFiltroDesde('')
                    setFechaFiltroHasta('')
                  }}
                  className="mb-0.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-[#8997A6] transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
                >
                  Quitar filtro
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table
                className={`w-full border-collapse text-left text-sm ${embedded ? 'min-w-[1200px]' : 'min-w-[720px]'}`}
              >
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Creación</th>
                    <th className="px-4 py-3">Entrega esperada</th>
                    <th className="px-4 py-3">Prioridad</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Insumos</th>
                    <th className="min-w-[200px] px-4 py-3">Obs. depósito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {solicitudesOrdenadas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        {!ubicacionId?.trim()
                          ? 'Configurá ubicacionId en tu perfil para ver y crear solicitudes de tu sucursal.'
                          : 'Todavía no hay solicitudes de tu ubicación. Creá una con «Nueva solicitud».'}
                      </td>
                    </tr>
                  ) : solicitudesFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        No hay solicitudes en el rango de fechas elegido. Probá ampliar
                        «Desde» / «Hasta» o quitá el filtro.
                      </td>
                    </tr>
                  ) : (
                    solicitudesFiltradas.map((s) => (
                      <tr key={s.id} className="hover:bg-neutral-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                          {formatFechaCreacion(s.fechaCreacion)}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {s.fechaEntregaEsperada || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor:
                                s.prioridad === 'Urgente'
                                  ? '#FEE2E2'
                                  : s.prioridad === 'Alta'
                                    ? '#F3F4F6'
                                    : '#F9FAFB',
                              color:
                                s.prioridad === 'Urgente'
                                  ? '#CD1818'
                                  : '#8997A6',
                            }}
                          >
                            {s.prioridad}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={estiloBadgeEstadoSolicitud(s.estado)}
                          >
                            {s.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm tabular-nums text-[#171717]">
                              {s.items.length}{' '}
                              {s.items.length === 1 ? 'insumo' : 'insumos'}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <Link
                                to={`${solicitudDetalleBasePath.replace(/\/$/, '')}/${encodeURIComponent(s.id)}`}
                                title="Ver detalle"
                                aria-label="Ver detalle"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#CD1818] shadow-sm transition hover:border-[#CD1818]/35 hover:bg-red-50/60"
                              >
                                <Eye className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                              </Link>
                              <button
                                type="button"
                                title="Descargar PDF"
                                aria-label="Descargar PDF"
                                onClick={() => exportarSolicitudMercaderiaResumenPdf(s)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#171717] shadow-sm transition hover:border-[#CD1818]/35 hover:bg-neutral-50"
                              >
                                <FileDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#8997A6]">
                          {s.observacionesDeposito?.trim()
                            ? s.observacionesDeposito
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** Vista formulario: lista larga con scroll + pie fijo con envío */
  const embedded = variant === 'embedded'
  return (
    <div
      className={
        embedded
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex min-h-full flex-1 flex-col bg-neutral-50'
      }
    >
      <div
        className={
          embedded
            ? 'shrink-0 border-b border-neutral-200 pb-3'
            : 'shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8 xl:px-10'
        }
      >
        <button
          type="button"
          onClick={() => setIsCreating(false)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#CD1818] transition hover:bg-neutral-100"
        >
          <span aria-hidden>←</span>
          Volver al historial
        </button>
        {embedded ? (
          <p className="mt-1 text-xs text-[#8997A6]">
            Fecha, prioridad e insumos. Enviá con el botón inferior.
          </p>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#CD1818]">
              Nueva solicitud
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[#8997A6]">
              Completá fecha, prioridad e insumos. El envío queda fijo abajo a la
              derecha.
            </p>
          </>
        )}
      </div>

      <form onSubmit={handleEnviar} className="flex min-h-0 flex-1 flex-col">
        <div
          className={
            embedded
              ? 'min-h-0 flex-1 overflow-y-auto pb-28 pt-4'
              : 'min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-6 sm:px-6 sm:pb-36 lg:px-8 xl:px-10'
          }
        >
          <div className="w-full space-y-8">
            <div
              className={
                embedded
                  ? 'flex flex-wrap gap-2 rounded-lg border border-neutral-200 bg-white p-2'
                  : 'flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm'
              }
              role="tablist"
              aria-label="Modalidad de requisición"
            >
              <button
                type="button"
                role="tab"
                aria-selected={modoRequisicion === 'libre'}
                onClick={() => setModoRequisicion('libre')}
                className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${
                  modoRequisicion === 'libre'
                    ? 'bg-[#CD1818] text-white shadow-sm'
                    : 'text-[#171717] hover:bg-neutral-50'
                }`}
              >
                Requisición libre
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modoRequisicion === 'planificada'}
                onClick={() => setModoRequisicion('planificada')}
                className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${
                  modoRequisicion === 'planificada'
                    ? 'bg-[#CD1818] text-white shadow-sm'
                    : 'text-[#171717] hover:bg-neutral-50'
                }`}
              >
                Planificada por producción
              </button>
            </div>

            <div
              className={
                embedded
                  ? 'grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2'
                  : 'grid gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-7'
              }
            >
              <label className="block text-left">
                <span className="text-xs font-medium text-[#8997A6]">
                  Fecha de entrega esperada
                </span>
                <input
                  type="date"
                  required
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                  className="mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                />
              </label>
              <label className="block text-left">
                <span className="text-xs font-medium text-[#8997A6]">
                  Prioridad
                </span>
                <select
                  value={prioridad}
                  onChange={(e) =>
                    setPrioridad(e.target.value as PrioridadSolicitud)
                  }
                  className="mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {modoRequisicion === 'planificada' ? (
              <div
                className={
                  embedded
                    ? 'rounded-lg border border-neutral-200 bg-white p-4'
                    : 'rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7'
                }
              >
                <p
                  className={
                    embedded
                      ? 'mb-3 text-xs font-semibold uppercase tracking-wide text-[#CD1818]'
                      : 'mb-5 text-sm font-semibold text-[#CD1818]'
                  }
                >
                  Producción planificada
                </p>
                <p className="mb-4 text-sm text-[#8997A6]">
                  Elegí un plato del recetario y las porciones objetivo. El sistema
                  calcula los insumos teóricos y arma la requisición al depósito.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-left sm:col-span-2">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Plato / receta
                    </span>
                    <select
                      value={recetaPlanId}
                      onChange={(e) => setRecetaPlanId(e.target.value)}
                      className="mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                      required
                    >
                      <option value="">Seleccionar…</option>
                      {recetasOrdenadas.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nombre}
                          {r.rendimientoPorciones > 0
                            ? ` (rend. ${r.rendimientoPorciones} porc.)`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-left">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Porciones a elaborar
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={porcionesPlanStr}
                      onChange={(e) => setPorcionesPlanStr(e.target.value)}
                      className="mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-base text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                      required
                    />
                  </label>
                </div>

                <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-[#8997A6]">
                        <th className="px-3 py-2.5">Insumo teórico</th>
                        <th className="px-3 py-2.5 text-right">Cantidad</th>
                        <th className="px-3 py-2.5">Unidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {previewPlanificada.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-6 text-center text-[#8997A6]"
                          >
                            {recetaPlanSeleccionada
                              ? 'Sin ingredientes escalables para esas porciones.'
                              : 'Seleccioná una receta para ver el listado.'}
                          </td>
                        </tr>
                      ) : (
                        previewPlanificada.map((row, idx) => (
                          <tr key={`${row.insumoId ?? row.producto}-${idx}`}>
                            <td className="px-3 py-2.5 text-[#171717]">
                              {row.producto}
                              {!row.insumoId ? (
                                <span className="ml-2 text-[10px] font-semibold uppercase text-amber-700">
                                  Sin catálogo
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                              {row.cantidad.toLocaleString('es-AR', {
                                maximumFractionDigits: 4,
                              })}
                            </td>
                            <td className="px-3 py-2.5 text-[#8997A6]">
                              {row.unidadMedida}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <div
              className={
                embedded
                  ? 'rounded-lg border border-neutral-200 bg-white p-4'
                  : 'rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7'
              }
            >
              <p
                className={
                  embedded
                    ? 'mb-3 text-xs font-semibold uppercase tracking-wide text-[#CD1818]'
                    : 'mb-5 text-sm font-semibold text-[#CD1818]'
                }
              >
                Insumos
              </p>
              {embedded ? null : (
              <p className="mb-5 text-sm text-[#8997A6]">
                Elegí artículos por nombre genérico. La cocina solicita el concepto
                del insumo y el depósito define luego la marca o presentación comercial.
              </p>
              )}
              <div className="mb-4 hidden rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 lg:block">
                <div className="grid gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8997A6] lg:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto]">
                  <span>Artículo genérico</span>
                  <span>Cantidad</span>
                  <span>Unidad de medida</span>
                  <span>Presentación</span>
                  <span>Observación</span>
                  <span className="text-right">Acción</span>
                </div>
              </div>
              <div className="space-y-5">
                {filas.map((fila, i) => {
                  const productoSeleccionado = fila.producto.trim().length > 0

                  return (
                    <div
                      key={fila.key}
                      className={`grid gap-5 rounded-xl border border-gray-200 bg-gray-50 p-5 shadow-sm lg:items-end lg:gap-x-4 lg:gap-y-4 lg:p-6 ${
                        !productoSeleccionado
                          ? ''
                          : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto]'
                      }`}
                    >
                      <div
                        className={
                          !productoSeleccionado ? 'lg:col-span-6' : 'min-w-0'
                        }
                      >
                        <InsumoGenericoSearchSelect
                          opciones={insumosGenericos}
                          selectedLabel={
                            fila.producto.trim() && fila.unidadMedida.trim()
                              ? `${fila.producto} (${fila.unidadMedida})`
                              : ''
                          }
                          onSelect={(option) => {
                            const primer = insumos.find(
                              (ins) =>
                                normalizarTexto(ins.nombreGenerico.trim()) ===
                                option.key,
                            )
                            actualizarFila(i, {
                              producto: option.nombreGenerico,
                              unidadMedida: option.unidadBase,
                              presentacion: '',
                              insumoRepresentativoId: primer?.id ?? '',
                            })
                          }}
                          onClear={() =>
                            actualizarFila(i, {
                              producto: '',
                              unidadMedida: '',
                              presentacion: '',
                              cantidad: '',
                              observacion: '',
                              insumoRepresentativoId: '',
                            })
                          }
                        />
                      </div>

                      {productoSeleccionado ? (
                        <>
                          <label className="block text-left">
                            <span className="text-xs font-medium text-[#8997A6]">
                              Cantidad
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={fila.cantidad}
                              onChange={(e) =>
                                actualizarFila(i, { cantidad: e.target.value })
                              }
                              className={inputInsumoClass}
                              placeholder="0"
                              required
                            />
                          </label>
                          <label className="block text-left">
                            <span className="text-xs font-medium text-[#8997A6]">
                              Unidad de medida
                            </span>
                            <select
                              value={fila.unidadMedida}
                              disabled
                              className={`${selectInsumoClass} cursor-not-allowed opacity-90`}
                            >
                              <option value={fila.unidadMedida}>
                                {fila.unidadMedida}
                              </option>
                            </select>
                          </label>
                          <label className="block text-left">
                            <span className="text-xs font-medium text-[#8997A6]">
                              Presentación
                            </span>
                            <select
                              value={fila.presentacion}
                              onChange={(e) =>
                                actualizarFila(i, {
                                  presentacion: e.target.value,
                                })
                              }
                              className={selectInsumoClass}
                            >
                              <option value="">Sin preferencia</option>
                              {PRESENTACIONES_OPCIONES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-left">
                            <span className="text-xs font-medium text-[#8997A6]">
                              Observación
                            </span>
                            <input
                              type="text"
                              value={fila.observacion}
                              onChange={(e) =>
                                actualizarFila(i, {
                                  observacion: e.target.value,
                                })
                              }
                              className={inputInsumoClass}
                              placeholder="Ej. Sin TACC, marca puntual..."
                            />
                          </label>
                          <div className="flex items-end lg:justify-end">
                            <button
                              type="button"
                              onClick={() => quitarFila(i)}
                              disabled={filas.length <= 1}
                              className="min-h-12 rounded-xl px-3 text-sm font-medium text-[#8997A6] underline-offset-2 transition hover:bg-white hover:text-[#CD1818] hover:underline disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              Quitar
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-end lg:col-span-6">
                          <button
                            type="button"
                            onClick={() => quitarFila(i)}
                            disabled={filas.length <= 1}
                            className="min-h-12 rounded-xl px-3 text-sm font-medium text-[#8997A6] underline-offset-2 transition hover:bg-white hover:text-[#CD1818] hover:underline disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <button
                  type="button"
                  onClick={agregarFila}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/10"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Agregar otro insumo
                </button>
              </div>
            </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 xl:px-10">
          <div className="flex w-full justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#CD1818] px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
            >
              {enviando
                ? 'Enviando…'
                : modoRequisicion === 'planificada'
                  ? 'Generar requisición al depósito'
                  : 'Enviar solicitud al depósito'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
