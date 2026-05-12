import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackagePlus } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import type { EgresoPrefillDesdeSolicitud } from '../../lib/depositoEgresoPrefill'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import { destinoEgresoYUbicacionDesdeSolicitante } from '../../lib/movimientosInventario'
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

const btnExportOutline =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50'

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

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
      return '4px solid #a3a3a3'
    case 'En Preparación':
      return '4px solid #CD1818'
    case 'Enviado':
      return '4px solid #737373'
    case 'Recibido':
      return '4px solid #d4d4d4'
    case 'Rechazado':
      return '4px solid #dc2626'
    default:
      return '4px solid #e5e7eb'
  }
}

function etiquetaDestinoSolicitud(s: SolicitudMercaderia): string {
  return destinoEgresoYUbicacionDesdeSolicitante(s.ubicacionSolicitanteId).destinoEgreso
}

function construirPrefillEgreso(
  solicitud: SolicitudMercaderia,
  insumos: Insumo[],
): EgresoPrefillDesdeSolicitud | null {
  const { destinoEgreso, ubicacionDestino } = destinoEgresoYUbicacionDesdeSolicitante(
    solicitud.ubicacionSolicitanteId,
  )
  const items: EgresoPrefillDesdeSolicitud['items'] = []
  for (const it of solicitud.items) {
    let insumoId = it.insumoId?.trim() ?? ''
    if (!insumoId) {
      const key = normalizarTexto(it.producto)
      const match = insumos.find(
        (i) => normalizarTexto(i.nombreGenerico.trim()) === key,
      )
      insumoId = match?.id ?? ''
    }
    if (!insumoId) continue
    const ins = insumos.find((i) => i.id === insumoId)
    const nombreSnapshot = ins ? formatLabelInsumo(ins) : it.producto
    items.push({ insumoId, nombreSnapshot, cantidad: it.cantidad })
  }
  if (items.length === 0) return null
  return {
    solicitudId: solicitud.id,
    destinoEgreso,
    ubicacionDestino,
    items,
  }
}

function GestionSolicitudScreen({
  solicitud,
  onBack,
  onPrepararEnvio,
}: {
  solicitud: SolicitudMercaderia
  onBack: () => void
  onPrepararEnvio: (s: SolicitudMercaderia) => void
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

  const puedePrepararEnvio =
    solicitud.estado === 'Pendiente' || solicitud.estado === 'En Preparación'

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
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8 xl:px-10">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-100"
        >
          <span aria-hidden>←</span>
          Volver al listado
        </button>
        <div
          className="mt-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-5"
          style={{ borderLeft: bordeEstado(solicitud) }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8997A6]">
                Solicitud
              </p>
              <h2
                className="truncate font-mono text-sm font-semibold text-[#171717]"
                title={solicitud.id}
              >
                {solicitud.id}
              </h2>
              <div className="mt-2 space-y-1 text-sm text-[#171717]">
                <p>
                  <span className="font-medium text-[#171717]">Creada:</span>{' '}
                  {fechaCreacionStr}
                </p>
                <p>
                  <span className="font-medium text-[#171717]">
                    Entrega esperada:
                  </span>{' '}
                  {solicitud.fechaEntregaEsperada || '—'}
                </p>
                <p>
                  <span className="font-medium text-[#171717]">Destino:</span>{' '}
                  {etiquetaDestinoSolicitud(solicitud)}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor:
                        solicitud.prioridad === 'Urgente'
                          ? '#FEE2E2'
                          : solicitud.prioridad === 'Alta'
                            ? '#F3F4F6'
                            : '#e5e7eb',
                      color:
                        solicitud.prioridad === 'Urgente'
                          ? '#CD1818'
                          : '#8997A6',
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
            {puedePrepararEnvio ? (
              <button
                type="button"
                onClick={() => onPrepararEnvio(solicitud)}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
              >
                <PackagePlus className="h-4 w-4 shrink-0" aria-hidden />
                Preparar envío
              </button>
            ) : null}
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                Insumos solicitados
              </p>
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-gray-50 text-left text-xs uppercase text-[#8997A6]">
                      <th className="px-3 py-2.5 font-semibold">Producto</th>
                      <th className="px-3 py-2.5 font-semibold">Cantidad</th>
                      <th className="px-3 py-2.5 font-semibold">Unidad</th>
                      <th className="px-3 py-2.5 font-semibold">Presentación</th>
                      <th className="px-3 py-2.5 font-semibold">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {solicitud.items.map((it, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="px-3 py-2.5 font-medium text-[#171717]">
                          {it.producto}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-[#171717]">
                          {it.cantidad}
                        </td>
                        <td className="px-3 py-2.5 text-[#171717]">
                          {it.unidadMedida}
                        </td>
                        <td className="px-3 py-2.5 text-[#171717]">
                          {it.presentacion}
                        </td>
                        <td className="px-3 py-2.5 text-[#171717]">
                          {it.observacion || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-4 py-4 sm:px-5">
              <h3 className="text-sm font-semibold text-[#CD1818]">
                Gestión del pedido
              </h3>
              <p className="mt-1 text-xs text-[#8997A6]">
                Actualizá el estado logístico y registrá observaciones internas del depósito.
              </p>
            </div>
            <div className="bg-neutral-50 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="text-left sm:col-span-1">
                  <span className="text-xs font-medium text-[#8997A6]">Estado</span>
                  {depositoPuedeCambiarEstado ? (
                    <select
                      value={estado}
                      onChange={(e) =>
                        setEstado(e.target.value as EstadoSolicitudDeposito)
                      }
                      className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
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
                      <p className="text-xs text-[#8997A6]">
                        La cocina confirmó la recepción. El estado no puede modificarse
                        desde depósito.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <label className="mt-3 block text-left">
                <span className="text-xs font-medium text-[#8997A6]">
                  Observaciones del depósito
                </span>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                  placeholder='Ej. "Enviamos puré de tomate en vez de perita"'
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                />
              </label>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onBack}
                  className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50 sm:w-auto"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando}
                  className="min-h-11 w-full rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45 sm:w-auto"
                >
                  {guardando ? 'Guardando…' : 'Guardar estado y observaciones'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DepositoSolicitudesMercaderiaPanel() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [solicitudActivaId, setSolicitudActivaId] = useState<string | null>(null)

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

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

  const pendientesDeDespacho = useMemo(
    () =>
      ordenadas.filter(
        (s) => s.estado === 'Pendiente' || s.estado === 'En Preparación',
      ),
    [ordenadas],
  )

  const solicitudActiva = useMemo(() => {
    if (!solicitudActivaId) return null
    return ordenadas.find((x) => x.id === solicitudActivaId) ?? null
  }, [ordenadas, solicitudActivaId])

  useEffect(() => {
    if (solicitudActivaId && !ordenadas.some((x) => x.id === solicitudActivaId)) {
      setSolicitudActivaId(null)
    }
  }, [ordenadas, solicitudActivaId])

  function prepararEnvio(s: SolicitudMercaderia) {
    const pre = construirPrefillEgreso(s, insumos)
    if (!pre) {
      showToast(
        'No se pudo armar el egreso: cada ítem debe tener un insumo del catálogo (nombre genérico coincidente o ID guardado en la solicitud).',
        'error',
      )
      return
    }
    navigate('/deposito/movimientos', {
      replace: true,
      state: { egresoDesdeSolicitud: pre },
    })
  }

  if (solicitudActiva) {
    return (
      <GestionSolicitudScreen
        solicitud={solicitudActiva}
        onBack={() => setSolicitudActivaId(null)}
        onPrepararEnvio={prepararEnvio}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-neutral-100 bg-white px-4 py-3 sm:px-6">
        <p className="text-sm text-[#8997A6]">
          Pedidos en estado <strong className="text-[#171717]">Pendiente</strong> o{' '}
          <strong className="text-[#171717]">En preparación</strong>. Usá «Preparar envío» para
          abrir el egreso con ítems precargados; elegís los lotes en el formulario.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
        {pendientesDeDespacho.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-[#8997A6] shadow-sm">
            No hay solicitudes pendientes de despacho.
          </div>
        ) : (
          <div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">ID / Creación</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Entrega esperada</th>
                    <th className="px-4 py-3">Prioridad</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Insumos</th>
                    <th className="min-w-[200px] px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pendientesDeDespacho.map((s) => (
                    <tr
                      key={s.id}
                      className="bg-white hover:bg-neutral-50/80"
                      style={{ borderLeft: bordeEstado(s) }}
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs text-[#8997A6]" title={s.id}>
                          {s.id.slice(0, 10)}…
                        </p>
                        <p className="mt-1 whitespace-nowrap text-[#171717]">
                          {formatFechaCreacion(s.fechaCreacion)}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-[#171717]">
                        {etiquetaDestinoSolicitud(s)}
                      </td>
                      <td className="px-4 py-3 align-top text-[#171717]">
                        {s.fechaEntregaEsperada || '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor:
                              s.prioridad === 'Urgente'
                                ? '#FEE2E2'
                                : s.prioridad === 'Alta'
                                  ? '#e5e7eb'
                                  : '#e5e7eb',
                            color:
                              s.prioridad === 'Urgente'
                                ? '#CD1818'
                                : '#8997A6',
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
                      <td className="px-4 py-3 align-top tabular-nums text-[#171717]">
                        {s.items.length} {s.items.length === 1 ? 'insumo' : 'insumos'}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            onClick={() => prepararEnvio(s)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                          >
                            <PackagePlus className="h-4 w-4 shrink-0" aria-hidden />
                            Preparar envío
                          </button>
                          <button
                            type="button"
                            onClick={() => setSolicitudActivaId(s.id)}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50"
                          >
                            Gestionar pedido
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
