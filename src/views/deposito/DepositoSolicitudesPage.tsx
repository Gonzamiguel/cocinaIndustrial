import { useEffect, useMemo, useState } from 'react'
import {
  actualizarSolicitudMercaderiaDeposito,
  ESTADOS_DEPOSITO,
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudesMercaderia,
  type EstadoSolicitudDeposito,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import { exportarSolicitudMercaderiaExcel } from '../../lib/mercaderiaExcel'
import { exportarSolicitudMercaderiaPdf } from '../../lib/mercaderiaPdf'
import { useToast } from '../../context/ToastContext'

const corporate = { blue: '#003366', orange: '#F39200' } as const

const btnExportOutline =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[#003366] bg-white px-3 py-2 text-xs font-semibold text-[#003366] shadow-sm transition hover:bg-[#003366]/5'

function ordenPrioridadVisual(a: SolicitudMercaderia): number {
  if (a.estado === 'Pendiente') return 0
  if (a.estado === 'En Preparación') return 1
  if (a.estado === 'Enviado') return 2
  return 3
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

function bordeEstado(s: SolicitudMercaderia): string {
  switch (s.estado) {
    case 'Pendiente':
      return `4px solid ${corporate.orange}`
    case 'En Preparación':
      return `4px solid ${corporate.blue}`
    case 'Enviado':
      return '4px solid #0284c7'
    case 'Recibido':
      return '4px solid #16a34a'
    case 'Rechazado':
      return '4px solid #dc2626'
    default:
      return '4px solid #e5e7eb'
  }
}

function ModalGestionSolicitud({
  solicitud,
  onClose,
}: {
  solicitud: SolicitudMercaderia
  onClose: () => void
}) {
  const { showToast } = useToast()
  const depositoPuedeCambiarEstado = solicitud.estado !== 'Recibido'
  const [estado, setEstado] = useState<EstadoSolicitudDeposito>(() =>
    solicitud.estado === 'Recibido'
      ? 'Enviado'
      : (solicitud.estado as EstadoSolicitudDeposito),
  )
  const [observaciones, setObservaciones] = useState(
    solicitud.observacionesDeposito,
  )
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setObservaciones(solicitud.observacionesDeposito)
    if (depositoPuedeCambiarEstado) {
      setEstado(solicitud.estado as EstadoSolicitudDeposito)
    }
  }, [
    solicitud.id,
    solicitud.estado,
    solicitud.observacionesDeposito,
    depositoPuedeCambiarEstado,
  ])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function guardar() {
    setGuardando(true)
    try {
      if (!depositoPuedeCambiarEstado) {
        await actualizarSolicitudMercaderiaDeposito(solicitud.id, {
          observacionesDeposito: observaciones,
        })
      } else {
        await actualizarSolicitudMercaderiaDeposito(solicitud.id, {
          estado,
          observacionesDeposito: observaciones,
        })
      }
      showToast('Solicitud actualizada.')
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'No se pudo guardar.',
        'error',
      )
    } finally {
      setGuardando(false)
    }
  }

  function exportarExcel() {
    try {
      exportarSolicitudMercaderiaExcel(solicitud)
      showToast('Planilla descargada.')
    } catch {
      showToast('No se pudo exportar.', 'error')
    }
  }

  function exportarPdf() {
    try {
      exportarSolicitudMercaderiaPdf(solicitud)
      showToast('PDF generado.')
    } catch {
      showToast('No se pudo generar el PDF.', 'error')
    }
  }

  const fechaCreacionStr = formatFechaCreacion(solicitud.fechaCreacion)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-gestion-solicitud-titulo"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 border-b border-neutral-100 px-4 py-4 sm:px-5"
          style={{ borderLeft: bordeEstado(solicitud) }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Solicitud
              </p>
              <h2
                id="modal-gestion-solicitud-titulo"
                className="truncate font-mono text-sm font-semibold text-neutral-900"
                title={solicitud.id}
              >
                {solicitud.id}
              </h2>
              <div className="mt-2 space-y-1 text-sm text-neutral-700">
                <p>
                  <span className="font-medium text-neutral-900">Creada:</span>{' '}
                  {fechaCreacionStr}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">
                    Entrega esperada:
                  </span>{' '}
                  {solicitud.fechaEntregaEsperada || '—'}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor:
                        solicitud.prioridad === 'Urgente'
                          ? `${corporate.orange}22`
                          : solicitud.prioridad === 'Alta'
                            ? '#fef3c7'
                            : '#e5e7eb',
                      color:
                        solicitud.prioridad === 'Urgente'
                          ? corporate.orange
                          : '#374151',
                    }}
                  >
                    {solicitud.prioridad}
                  </span>
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={estiloBadgeEstadoSolicitud(solicitud.estado)}
                  >
                    {solicitud.estado}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
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

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={exportarExcel} className={btnExportOutline}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Exportar Excel
            </button>
            <button type="button" onClick={exportarPdf} className={btnExportOutline}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                <path d="M13 3v6h6" />
              </svg>
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: corporate.blue }}
          >
            Insumos solicitados
          </p>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr
                  className="border-b border-neutral-200 text-left text-xs uppercase"
                  style={{ backgroundColor: `${corporate.blue}0d`, color: corporate.blue }}
                >
                  <th className="px-3 py-2.5 font-semibold">Producto</th>
                  <th className="px-3 py-2.5 font-semibold">Cantidad</th>
                  <th className="px-3 py-2.5 font-semibold">Unidad</th>
                  <th className="px-3 py-2.5 font-semibold">Presentación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {solicitud.items.map((it, idx) => (
                  <tr key={idx} className="bg-white">
                    <td className="px-3 py-2.5 font-medium text-neutral-900">
                      {it.producto}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-neutral-800">
                      {it.cantidad}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">{it.unidadMedida}</td>
                    <td className="px-3 py-2.5 text-neutral-700">{it.presentacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-left sm:col-span-1">
              <span className="text-xs font-medium text-neutral-600">Estado</span>
              {depositoPuedeCambiarEstado ? (
                <select
                  value={estado}
                  onChange={(e) =>
                    setEstado(e.target.value as EstadoSolicitudDeposito)
                  }
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
                >
                  {ESTADOS_DEPOSITO.map((es) => (
                    <option key={es} value={es}>
                      {es}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5 space-y-1">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={estiloBadgeEstadoSolicitud(solicitud.estado)}
                  >
                    {solicitud.estado}
                  </span>
                  <p className="text-xs text-neutral-500">
                    La cocina confirmó la recepción. El estado no puede modificarse
                    desde depósito.
                  </p>
                </div>
              )}
            </div>
          </div>
          <label className="mt-3 block text-left">
            <span className="text-xs font-medium text-neutral-600">
              Observaciones del depósito
            </span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder='Ej. "Enviamos puré de tomate en vez de perita"'
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
            />
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 sm:w-auto"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="min-h-11 w-full rounded-xl px-5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-45 sm:w-auto"
              style={{ backgroundColor: corporate.orange }}
            >
              {guardando ? 'Guardando…' : 'Guardar estado y observaciones'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DepositoSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [solicitudActivaId, setSolicitudActivaId] = useState<string | null>(null)

  useEffect(() => {
    return subscribeSolicitudesMercaderia(setSolicitudes)
  }, [])

  const ordenadas = useMemo(() => {
    return [...solicitudes].sort((a, b) => {
      const pa = ordenPrioridadVisual(a)
      const pb = ordenPrioridadVisual(b)
      if (pa !== pb) return pa - pb
      const ta = a.fechaCreacion?.getTime() ?? 0
      const tb = b.fechaCreacion?.getTime() ?? 0
      return tb - ta
    })
  }, [solicitudes])

  /** Solicitud mostrada en el modal; datos siempre alineados con Firestore. */
  const solicitudActiva = useMemo(() => {
    if (!solicitudActivaId) return null
    return ordenadas.find((x) => x.id === solicitudActivaId) ?? null
  }, [ordenadas, solicitudActivaId])

  useEffect(() => {
    if (solicitudActivaId && !ordenadas.some((x) => x.id === solicitudActivaId)) {
      setSolicitudActivaId(null)
    }
  }, [ordenadas, solicitudActivaId])

  const pendientes = ordenadas.filter(
    (s) =>
      s.estado === 'Pendiente' ||
      s.estado === 'En Preparación' ||
      s.estado === 'Enviado',
  ).length

  function cerrarModal() {
    setSolicitudActivaId(null)
  }

  return (
    <div className="flex flex-1 flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: corporate.blue }}
            >
              Solicitudes de mercadería
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Lista compacta: abrí cada pedido para ver insumos, exportar y actualizar
              estado.
            </p>
          </div>
          {pendientes > 0 ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: corporate.orange }}
            >
              {pendientes} activa{pendientes === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {ordenadas.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
            No hay solicitudes registradas.
          </div>
        ) : (
          <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr
                    className="text-xs uppercase tracking-wide text-white"
                    style={{ backgroundColor: corporate.blue }}
                  >
                    <th className="px-4 py-3">ID / Creación</th>
                    <th className="px-4 py-3">Entrega esperada</th>
                    <th className="px-4 py-3">Prioridad</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Insumos</th>
                    <th className="min-w-[160px] px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {ordenadas.map((s) => (
                    <tr
                      key={s.id}
                      className="bg-white hover:bg-neutral-50/80"
                      style={{ borderLeft: bordeEstado(s) }}
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs text-neutral-600" title={s.id}>
                          {s.id.slice(0, 10)}…
                        </p>
                        <p className="mt-1 whitespace-nowrap text-neutral-800">
                          {formatFechaCreacion(s.fechaCreacion)}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-neutral-800">
                        {s.fechaEntregaEsperada || '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor:
                              s.prioridad === 'Urgente'
                                ? `${corporate.orange}22`
                                : s.prioridad === 'Alta'
                                  ? '#fef3c7'
                                  : '#e5e7eb',
                            color:
                              s.prioridad === 'Urgente'
                                ? corporate.orange
                                : '#374151',
                          }}
                        >
                          {s.prioridad}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={estiloBadgeEstadoSolicitud(s.estado)}
                        >
                          {s.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top tabular-nums text-neutral-700">
                        {s.items.length} {s.items.length === 1 ? 'insumo' : 'insumos'}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setSolicitudActivaId(s.id)}
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-md transition hover:brightness-105 sm:w-auto"
                          style={{ backgroundColor: corporate.orange }}
                        >
                          Gestionar pedido
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {solicitudActiva ? (
        <ModalGestionSolicitud solicitud={solicitudActiva} onClose={cerrarModal} />
      ) : null}
    </div>
  )
}
