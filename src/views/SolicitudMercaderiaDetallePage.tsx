import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudMercaderiaPorId,
  type SolicitudMercaderia,
} from '../lib/solicitudesMercaderia'

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

export function SolicitudMercaderiaDetallePage() {
  const { solicitudId } = useParams<{ solicitudId: string }>()
  const location = useLocation()
  const [solicitud, setSolicitud] = useState<SolicitudMercaderia | null | undefined>(undefined)

  const volverA = useMemo(
    () =>
      location.pathname.startsWith('/admin/')
        ? '/admin/mercaderia'
        : '/campamento/solicitud-mercaderia',
    [location.pathname],
  )

  const recepcionLink = useMemo(() => {
    if (location.pathname.startsWith('/admin/')) {
      return { to: '/admin/mercaderia', state: { tab: 'recepcion' as const } }
    }
    return { to: '/campamento/recepcion' }
  }, [location.pathname])

  useEffect(() => {
    const id = solicitudId?.trim() ?? ''
    if (!id) {
      setSolicitud(null)
      return
    }
    return subscribeSolicitudMercaderiaPorId(id, setSolicitud)
  }, [solicitudId])

  const cargando = solicitud === undefined
  const noExiste = solicitud === null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to={volverA}
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#CD1818] transition hover:underline"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Volver al listado
          </Link>
          {solicitud ? (
            <p className="font-mono text-xs text-neutral-500 sm:text-right">ID {solicitud.id}</p>
          ) : null}
        </div>
        <div className="mx-auto mt-3 max-w-5xl">
          <h1 className="text-xl font-semibold tracking-tight text-[#171717] sm:text-2xl">
            Detalle de la solicitud
          </h1>
          {cargando ? (
            <p className="mt-1 text-sm text-neutral-500">Cargando…</p>
          ) : noExiste ? (
            <p className="mt-1 text-sm text-red-600">
              No se encontró la solicitud o no tenés permiso para verla.
            </p>
          ) : null}
        </div>
      </header>

      {!cargando && solicitud ? (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-8 pb-10">
            {solicitud.estado === 'Enviado' ? (
              <div className="rounded-xl border border-[#CD1818]/20 bg-[#CD1818]/5 p-5 text-sm text-[#171717]">
                <p className="font-semibold text-[#CD1818]">El depósito envió tu pedido</p>
                <p className="mt-2 leading-relaxed text-[#525252]">
                  Revisá el remito con los ítems enviados en{' '}
                  <strong>Remitos del depósito</strong>: podés aprobar las cantidades (con
                  diferencias si hace falta), editar lo recibido o rechazar el envío. Al confirmar,
                  la mercadería ingresa automáticamente a tu stock local.
                </p>
                <Link
                  to={recepcionLink.to}
                  state={recepcionLink.state}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                >
                  Ir a remitos del depósito
                </Link>
              </div>
            ) : null}

            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <dt className="text-xs font-medium text-[#8997A6]">Fecha de creación</dt>
                <dd className="mt-1 font-medium text-[#171717]">
                  {formatFechaCreacion(solicitud.fechaCreacion)}
                </dd>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <dt className="text-xs font-medium text-[#8997A6]">Entrega esperada</dt>
                <dd className="mt-1 font-medium text-[#171717]">
                  {solicitud.fechaEntregaEsperada || '—'}
                </dd>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <dt className="text-xs font-medium text-[#8997A6]">Prioridad</dt>
                <dd className="mt-2">
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor:
                        solicitud.prioridad === 'Urgente'
                          ? '#FEE2E2'
                          : solicitud.prioridad === 'Alta'
                            ? '#F3F4F6'
                            : '#F9FAFB',
                      color:
                        solicitud.prioridad === 'Urgente' ? '#CD1818' : '#8997A6',
                    }}
                  >
                    {solicitud.prioridad}
                  </span>
                </dd>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
                <dt className="text-xs font-medium text-[#8997A6]">Estado</dt>
                <dd className="mt-2">
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={estiloBadgeEstadoSolicitud(solicitud.estado)}
                  >
                    {solicitud.estado}
                  </span>
                </dd>
              </div>
            </dl>

            {solicitud.ubicacionSolicitanteId ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                  Ubicación solicitante
                </p>
                <p className="mt-1 font-mono text-[#171717]">{solicitud.ubicacionSolicitanteId}</p>
              </div>
            ) : null}

            {solicitud.observacionesDeposito?.trim() ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-[#171717]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                  Observaciones del depósito
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                  {solicitud.observacionesDeposito}
                </p>
              </div>
            ) : null}

            {solicitud.observacionesRecepcion?.trim() ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-[#171717]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                  Observaciones de recepción
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                  {solicitud.observacionesRecepcion}
                </p>
              </div>
            ) : null}

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Insumos pedidos
              </h2>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
                      <th className="px-4 py-3 font-semibold">Producto</th>
                      <th className="px-4 py-3 font-semibold">Cantidad</th>
                      <th className="px-4 py-3 font-semibold">Unidad</th>
                      <th className="px-4 py-3 font-semibold">Presentación</th>
                      <th className="min-w-[12rem] px-4 py-3 font-semibold">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {solicitud.items.map((it, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="px-4 py-3 font-medium text-[#171717]">{it.producto}</td>
                        <td className="px-4 py-3 tabular-nums text-[#171717]">{it.cantidad}</td>
                        <td className="px-4 py-3 text-[#171717]">{it.unidadMedida}</td>
                        <td className="px-4 py-3 text-[#171717]">{it.presentacion}</td>
                        <td className="px-4 py-3 whitespace-pre-wrap text-[#171717]">
                          {it.observacion || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-6">
              <Link
                to={volverA}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50"
              >
                Volver al listado
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
