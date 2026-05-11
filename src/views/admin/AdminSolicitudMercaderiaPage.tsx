import { useEffect, useMemo, useRef, useState } from 'react'
import {
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import {
  confirmarRecepcionMercaderia,
  crearSolicitudMercaderia,
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudesMercaderia,
  type ItemSolicitudMercaderia,
  type PrioridadSolicitud,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import { useToast } from '../../context/ToastContext'

type FilaDraft = {
  key: string
  producto: string
  cantidad: string
  unidadMedida: string
  presentacion: string
  observacion: string
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

export function AdminSolicitudMercaderiaPage() {
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [lista, setLista] = useState<SolicitudMercaderia[]>([])
  const [enviando, setEnviando] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const [fechaEntrega, setFechaEntrega] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>('Normal')
  const [filas, setFilas] = useState<FilaDraft[]>(() => [nuevaFila()])
  const [detalleModalId, setDetalleModalId] = useState<string | null>(null)
  const [obsRecepcionDraft, setObsRecepcionDraft] = useState('')
  const [confirmandoRecepcion, setConfirmandoRecepcion] = useState(false)

  useEffect(() => {
    return subscribeSolicitudesMercaderia(setLista)
  }, [])

  useEffect(() => {
    return subscribeInsumos(setInsumos)
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

  useEffect(() => {
    setObsRecepcionDraft('')
  }, [detalleModalId])

  useEffect(() => {
    if (!detalleModalId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetalleModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detalleModalId])

  const solicitudesOrdenadas = useMemo(() => {
    return [...lista].sort((a, b) => {
      const ta = a.fechaCreacion?.getTime() ?? 0
      const tb = b.fechaCreacion?.getTime() ?? 0
      return tb - ta
    })
  }, [lista])

  const solicitudEnDetalle = useMemo(() => {
    if (!detalleModalId) return null
    return solicitudesOrdenadas.find((x) => x.id === detalleModalId) ?? null
  }, [detalleModalId, solicitudesOrdenadas])

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

  async function handleConfirmarRecepcion() {
    if (!solicitudEnDetalle) return
    setConfirmandoRecepcion(true)
    try {
      await confirmarRecepcionMercaderia(
        solicitudEnDetalle.id,
        obsRecepcionDraft,
      )
      showToast('Recepción confirmada. El pedido quedó como Recibido.')
      setDetalleModalId(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo confirmar la recepción.',
        'error',
      )
    } finally {
      setConfirmandoRecepcion(false)
    }
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    const items: ItemSolicitudMercaderia[] = []
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

      items.push({
        producto: prod,
        cantidad: cant,
        unidadMedida: um,
        presentacion: f.presentacion.trim(),
        observacion: f.observacion.trim(),
      })
    }

    if (items.length === 0) {
      showToast('Agregá al menos un insumo con producto y cantidad válidos.', 'error')
      return
    }
    if (!fechaEntrega.trim()) {
      showToast('Indicá la fecha de entrega esperada.', 'error')
      return
    }

    setEnviando(true)
    try {
      await crearSolicitudMercaderia({
        fechaEntregaEsperada: fechaEntrega.trim(),
        prioridad,
        items,
      })
      showToast('Solicitud enviada al depósito.')
      setFilas([nuevaFila()])
      setFechaEntrega('')
      setPrioridad('Normal')
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
    return (
      <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
        <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Solicitar mercadería
              </h1>
              <p className="mt-1 text-sm text-[#8997A6]">
                Seguimiento en tiempo real de tus solicitudes al depósito.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <span className="text-xl leading-none">+</span>
              Nueva solicitud
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Historial de solicitudes
              </h2>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                Actualización en vivo cuando el depósito cambia el estado u observaciones.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
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
                        Todavía no hay solicitudes. Creá una con «Nueva solicitud».
                      </td>
                    </tr>
                  ) : (
                    solicitudesOrdenadas.map((s) => (
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
                            <button
                              type="button"
                              onClick={() => setDetalleModalId(s.id)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#CD1818] underline-offset-4 transition hover:underline"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-4 w-4 shrink-0 opacity-90"
                                aria-hidden
                              >
                                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                <path
                                  fillRule="evenodd"
                                  d="M.664 10.59a1.651 1.651 0 010-1.186A11.007 11.007 0 014.702 4.62a11.003 11.003 0 0110.596 0 11.003 11.003 0 014.042 3.784 1.65 1.65 0 010 1.186 11.007 11.007 0 01-4.042 3.784 11.003 11.003 0 01-10.596 0 11.003 11.003 0 01-4.042-3.784zM14.016 10a4.017 4.017 0 10-8.035 0 4.017 4.017 0 008.035 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Ver detalle
                            </button>
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

        {solicitudEnDetalle ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setDetalleModalId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-detalle-solicitud-titulo"
              className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
                <h2
                  id="modal-detalle-solicitud-titulo"
                  className="text-lg font-semibold text-[#171717]"
                >
                  Detalle de la Solicitud
                </h2>
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
                  aria-label="Cerrar"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-[#8997A6]">
                      Fecha de creación
                    </dt>
                    <dd className="mt-0.5 font-medium text-[#171717]">
                      {formatFechaCreacion(solicitudEnDetalle.fechaCreacion)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#8997A6]">
                      Entrega esperada
                    </dt>
                    <dd className="mt-0.5 font-medium text-[#171717]">
                      {solicitudEnDetalle.fechaEntregaEsperada || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#8997A6]">
                      Prioridad
                    </dt>
                    <dd className="mt-1">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor:
                            solicitudEnDetalle.prioridad === 'Urgente'
                              ? '#FEE2E2'
                              : solicitudEnDetalle.prioridad === 'Alta'
                                ? '#F3F4F6'
                                : '#F9FAFB',
                          color:
                            solicitudEnDetalle.prioridad === 'Urgente'
                              ? '#CD1818'
                              : '#8997A6',
                        }}
                      >
                        {solicitudEnDetalle.prioridad}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#8997A6]">
                      Estado
                    </dt>
                    <dd className="mt-1">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={estiloBadgeEstadoSolicitud(
                          solicitudEnDetalle.estado,
                        )}
                      >
                        {solicitudEnDetalle.estado}
                      </span>
                    </dd>
                  </div>
                </dl>

                {solicitudEnDetalle.observacionesDeposito?.trim() ? (
                  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#171717]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                      Observaciones del depósito
                    </p>
                    <p className="mt-1.5 leading-relaxed">
                      {solicitudEnDetalle.observacionesDeposito}
                    </p>
                  </div>
                ) : null}

                {solicitudEnDetalle.observacionesRecepcion?.trim() ? (
                  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#171717]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                      Observaciones de recepción (cocina)
                    </p>
                    <p className="mt-1.5 leading-relaxed">
                      {solicitudEnDetalle.observacionesRecepcion}
                    </p>
                  </div>
                ) : null}

                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                    Insumos
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
                          <th className="px-3 py-2 font-semibold">Producto</th>
                          <th className="px-3 py-2 font-semibold">Cantidad</th>
                          <th className="px-3 py-2 font-semibold">Unidad</th>
                          <th className="px-3 py-2 font-semibold">
                            Presentación
                          </th>
                          <th className="px-3 py-2 font-semibold">Observación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {solicitudEnDetalle.items.map((it, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="px-3 py-2 font-medium text-[#171717]">
                              {it.producto}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-[#171717]">
                              {it.cantidad}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {it.unidadMedida}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {it.presentacion}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {it.observacion || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {solicitudEnDetalle.estado === 'Enviado' ? (
                <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-5 py-4">
                  <label className="block text-left">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Observaciones de recepción{' '}
                      <span className="font-normal text-[#8997A6]">(opcional)</span>
                    </span>
                    <textarea
                      value={obsRecepcionDraft}
                      onChange={(e) => setObsRecepcionDraft(e.target.value)}
                      rows={2}
                      placeholder='Ej. "Faltó 1 kg de tomate, el resto OK"'
                      className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleConfirmarRecepcion()}
                    disabled={confirmandoRecepcion}
                    className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#CD1818] px-5 text-base font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
                  >
                    {confirmandoRecepcion
                      ? 'Confirmando…'
                      : 'Confirmar Recepción de Mercadería'}
                  </button>
                </div>
              ) : null}

              <div className="flex shrink-0 justify-end border-t border-neutral-100 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="min-h-10 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  /** Vista formulario: lista larga con scroll + pie fijo con envío */
  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8 xl:px-10">
        <button
          type="button"
          onClick={() => setIsCreating(false)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-100"
        >
          <span aria-hidden>←</span>
          Volver al historial
        </button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#CD1818]">
          Nueva solicitud
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#8997A6]">
          Completá fecha, prioridad e insumos. El envío queda fijo abajo a la
          derecha.
        </p>
      </div>

      <form
        onSubmit={handleEnviar}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-6 sm:px-6 sm:pb-36 lg:px-8 xl:px-10">
          <div className="w-full space-y-8">
            <div className="grid gap-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-7">
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

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <p className="mb-5 text-sm font-semibold text-[#CD1818]">
                Insumos
              </p>
              <p className="mb-5 text-sm text-[#8997A6]">
                Elegí artículos por nombre genérico. La cocina solicita el concepto
                del insumo y el depósito define luego la marca o presentación comercial.
              </p>
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
                          onSelect={(option) =>
                            actualizarFila(i, {
                              producto: option.nombreGenerico,
                              unidadMedida: option.unidadBase,
                              presentacion: '',
                            })
                          }
                          onClear={() =>
                            actualizarFila(i, {
                              producto: '',
                              unidadMedida: '',
                              presentacion: '',
                              cantidad: '',
                              observacion: '',
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
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 xl:px-10">
          <div className="flex w-full justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#CD1818] px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
            >
              {enviando ? 'Enviando…' : 'Enviar solicitud al depósito'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
