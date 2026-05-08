import { useEffect, useMemo, useState } from 'react'
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

const UNIDADES_MEDIDA = ['Kg', 'Lt', 'Un', 'Gr', 'Ml'] as const

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
  'mt-2 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15'

const corporate = {
  blue: '#003366',
  orange: '#F39200',
} as const

export function AdminSolicitudMercaderiaPage() {
  const { showToast } = useToast()
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
      const pres = f.presentacion.trim()
      if (!um || !pres) {
        showToast(
          'En cada insumo con producto y cantidad, seleccioná unidad de medida y presentación.',
          'error',
        )
        return
      }

      items.push({
        producto: prod,
        cantidad: cant,
        unidadMedida: um,
        presentacion: pres,
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
        <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1
                className="text-xl font-semibold tracking-tight"
                style={{ color: corporate.blue }}
              >
                Solicitar mercadería
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                Seguimiento en tiempo real de tus solicitudes al depósito.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-white shadow-md transition hover:brightness-105 active:brightness-95"
              style={{ backgroundColor: corporate.orange }}
            >
              <span className="text-xl leading-none">+</span>
              Nueva solicitud
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-neutral-100 px-4 py-3 sm:px-5">
              <h2
                className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: corporate.blue }}
              >
                Historial de solicitudes
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Actualización en vivo cuando el depósito cambia el estado u observaciones.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr
                    className="text-xs uppercase tracking-wide text-white"
                    style={{ backgroundColor: corporate.blue }}
                  >
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
                        className="px-4 py-16 text-center text-neutral-500"
                      >
                        Todavía no hay solicitudes. Creá una con «Nueva solicitud».
                      </td>
                    </tr>
                  ) : (
                    solicitudesOrdenadas.map((s) => (
                      <tr key={s.id} className="hover:bg-neutral-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                          {formatFechaCreacion(s.fechaCreacion)}
                        </td>
                        <td className="px-4 py-3 text-neutral-800">
                          {s.fechaEntregaEsperada || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor:
                                s.prioridad === 'Urgente'
                                  ? `${corporate.orange}33`
                                  : s.prioridad === 'Alta'
                                    ? '#fef3c7'
                                    : '#f3f4f6',
                              color:
                                s.prioridad === 'Urgente'
                                  ? corporate.orange
                                  : '#374151',
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
                            <span className="text-sm tabular-nums text-neutral-700">
                              {s.items.length}{' '}
                              {s.items.length === 1 ? 'insumo' : 'insumos'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDetalleModalId(s.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#003366] underline-offset-4 transition hover:underline"
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
                        <td className="px-4 py-3 text-xs text-neutral-600">
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
                  className="text-lg font-semibold text-neutral-900"
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
                    <dt className="text-xs font-medium text-neutral-500">
                      Fecha de creación
                    </dt>
                    <dd className="mt-0.5 font-medium text-neutral-900">
                      {formatFechaCreacion(solicitudEnDetalle.fechaCreacion)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-neutral-500">
                      Entrega esperada
                    </dt>
                    <dd className="mt-0.5 font-medium text-neutral-900">
                      {solicitudEnDetalle.fechaEntregaEsperada || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-neutral-500">
                      Prioridad
                    </dt>
                    <dd className="mt-1">
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor:
                            solicitudEnDetalle.prioridad === 'Urgente'
                              ? `${corporate.orange}33`
                              : solicitudEnDetalle.prioridad === 'Alta'
                                ? '#fef3c7'
                                : '#f3f4f6',
                          color:
                            solicitudEnDetalle.prioridad === 'Urgente'
                              ? corporate.orange
                              : '#374151',
                        }}
                      >
                        {solicitudEnDetalle.prioridad}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-neutral-500">
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
                  <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/90">
                      Observaciones del depósito
                    </p>
                    <p className="mt-1.5 leading-relaxed">
                      {solicitudEnDetalle.observacionesDeposito}
                    </p>
                  </div>
                ) : null}

                {solicitudEnDetalle.observacionesRecepcion?.trim() ? (
                  <div className="mt-5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/90">
                      Observaciones de recepción (cocina)
                    </p>
                    <p className="mt-1.5 leading-relaxed">
                      {solicitudEnDetalle.observacionesRecepcion}
                    </p>
                  </div>
                ) : null}

                <div className="mt-6">
                  <p
                    className="mb-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: corporate.blue }}
                  >
                    Insumos
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
                          <th className="px-3 py-2 font-semibold">Producto</th>
                          <th className="px-3 py-2 font-semibold">Cantidad</th>
                          <th className="px-3 py-2 font-semibold">Unidad</th>
                          <th className="px-3 py-2 font-semibold">
                            Presentación
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {solicitudEnDetalle.items.map((it, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="px-3 py-2 font-medium text-neutral-900">
                              {it.producto}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-neutral-800">
                              {it.cantidad}
                            </td>
                            <td className="px-3 py-2 text-neutral-700">
                              {it.unidadMedida}
                            </td>
                            <td className="px-3 py-2 text-neutral-700">
                              {it.presentacion}
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
                    <span className="text-xs font-medium text-neutral-600">
                      Observaciones de recepción{' '}
                      <span className="font-normal text-neutral-500">(opcional)</span>
                    </span>
                    <textarea
                      value={obsRecepcionDraft}
                      onChange={(e) => setObsRecepcionDraft(e.target.value)}
                      rows={2}
                      placeholder='Ej. "Faltó 1 kg de tomate, el resto OK"'
                      className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleConfirmarRecepcion()}
                    disabled={confirmandoRecepcion}
                    className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-base font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-45"
                    style={{ backgroundColor: corporate.orange }}
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
                  className="min-h-10 rounded-xl border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
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
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <button
          type="button"
          onClick={() => setIsCreating(false)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#003366] transition hover:bg-[#003366]/8"
        >
          <span aria-hidden>←</span>
          Volver al historial
        </button>
        <h1
          className="mt-2 text-xl font-semibold tracking-tight"
          style={{ color: corporate.blue }}
        >
          Nueva solicitud
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Completá fecha, prioridad e insumos. El envío queda fijo abajo a la derecha.
        </p>
      </div>

      <form
        onSubmit={handleEnviar}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pb-32 lg:px-10">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
              <label className="block text-left">
                <span className="text-xs font-medium text-neutral-600">
                  Fecha de entrega esperada
                </span>
                <input
                  type="date"
                  required
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-base outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                />
              </label>
              <label className="block text-left">
                <span className="text-xs font-medium text-neutral-600">
                  Prioridad
                </span>
                <select
                  value={prioridad}
                  onChange={(e) =>
                    setPrioridad(e.target.value as PrioridadSolicitud)
                  }
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-base outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              <p
                className="mb-4 text-sm font-semibold"
                style={{ color: corporate.blue }}
              >
                Insumos
              </p>
              <div className="space-y-4">
                {filas.map((fila, i) => (
                  <div
                    key={fila.key}
                    className="grid gap-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4 sm:grid-cols-12 sm:items-end sm:gap-x-3 sm:p-5"
                  >
                    <label className="sm:col-span-5">
                      <span className="text-xs font-medium text-neutral-600">
                        Producto
                      </span>
                      <input
                        type="text"
                        value={fila.producto}
                        onChange={(e) =>
                          actualizarFila(i, { producto: e.target.value })
                        }
                        className="mt-2 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                        placeholder="Ej. Aceite girasol"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-neutral-600">
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
                        className="mt-2 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                        placeholder="0"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-neutral-600">
                        Unidad de medida
                      </span>
                      <select
                        value={fila.unidadMedida}
                        onChange={(e) =>
                          actualizarFila(i, { unidadMedida: e.target.value })
                        }
                        className={selectInsumoClass}
                      >
                        <option value="">Seleccionar...</option>
                        {UNIDADES_MEDIDA.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs font-medium text-neutral-600">
                        Presentación
                      </span>
                      <select
                        value={fila.presentacion}
                        onChange={(e) =>
                          actualizarFila(i, { presentacion: e.target.value })
                        }
                        className={selectInsumoClass}
                      >
                        <option value="">Seleccionar...</option>
                        {PRESENTACIONES_OPCIONES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end sm:col-span-1 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => quitarFila(i)}
                        disabled={filas.length <= 1}
                        className="min-h-11 text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-30"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-neutral-100 pt-5">
                <button
                  type="button"
                  onClick={agregarFila}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#003366]/30 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#003366] shadow-none transition hover:border-[#003366]/50 hover:bg-[#003366]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/25"
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

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-5xl justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-45"
              style={{ backgroundColor: corporate.orange }}
            >
              {enviando ? 'Enviando…' : 'Enviar solicitud al depósito'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
