import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, Plus, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { puedeAprobarOc, puedeOperarFinanzas } from '../../lib/rbac'
import { NuevaOrdenCompraModal } from '../../components/compras/NuevaOrdenCompraModal'
import { EstadoOcBadge } from '../../components/compras/EstadoOcBadge'
import {
  aprobarOrdenCompra,
  enviarOrdenCompraAprobacion,
} from '../../lib/ordenesCompra'
import {
  formatFechaTimestamp,
  formatMonedaCompra,
  formatYmdLegible,
  mensajeErrorCompras,
} from '../../lib/comprasUi'
import {
  esRequisicionCompra,
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudesMercaderia,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import {
  subscribeOrdenesCompra,
  subscribeProveedoresTesoreria,
  type ProveedorTesoreria,
} from '../../lib/tesoreriaQueries'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import { nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { OrdenCompra } from '../../types/compras'

type TabCompras = 'solicitudes' | 'ordenes'

function BadgeEstadoSolicitud({ estado }: { estado: SolicitudMercaderia['estado'] }) {
  const style = estiloBadgeEstadoSolicitud(estado)
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {estado}
    </span>
  )
}

export function ComprasAprobacionPage() {
  const { user, rol } = useAuth()
  const { showToast } = useToast()
  const puedeCrearOc = puedeOperarFinanzas(rol)
  const puedeEnviar = puedeOperarFinanzas(rol)
  const puedeAprobar = puedeAprobarOc(rol)

  const [tab, setTab] = useState<TabCompras>('solicitudes')
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [proveedores, setProveedores] = useState<ProveedorTesoreria[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalNuevaOc, setModalNuevaOc] = useState(false)
  const [requisicionParaOc, setRequisicionParaOc] = useState<string | undefined>()
  const [aprobandoId, setAprobandoId] = useState<string | null>(null)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)

  useEffect(() => {
    let pending = 4
    const done = () => {
      pending -= 1
      if (pending <= 0) setCargando(false)
    }
    setCargando(true)
    const unsubs = [
      subscribeSolicitudesMercaderia((rows) => {
        setSolicitudes(rows)
        done()
      }),
      subscribeOrdenesCompra((rows) => {
        setOrdenes(rows)
        done()
      }),
      subscribeProveedoresTesoreria((rows) => {
        setProveedores(rows)
        done()
      }),
      subscribeInsumos((rows) => {
        setInsumos(rows)
        done()
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const requisicionesPendientes = useMemo(
    () =>
      solicitudes.filter((s) => esRequisicionCompra(s) && s.estado === 'Pendiente'),
    [solicitudes],
  )

  const borradores = useMemo(
    () => ordenes.filter((oc) => oc.estado === 'BORRADOR'),
    [ordenes],
  )

  const pendientesAprobacion = useMemo(
    () => ordenes.filter((oc) => oc.estado === 'PENDIENTE_APROBACION'),
    [ordenes],
  )

  const historialOc = useMemo(
    () =>
      ordenes.filter((oc) =>
        ['APROBADA', 'RECIBIDA_PARCIAL', 'COMPLETADA', 'CANCELADA'].includes(oc.estado),
      ),
    [ordenes],
  )

  async function handleEnviarAprobacion(oc: OrdenCompra) {
    if (!user || !puedeEnviar) return
    setEnviandoId(oc.id)
    try {
      await enviarOrdenCompraAprobacion({
        ordenCompraId: oc.id,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(`OC ${oc.numero} enviada a aprobación.`, 'success')
    } catch (err) {
      showToast(mensajeErrorCompras(err), 'error')
    } finally {
      setEnviandoId(null)
    }
  }

  async function handleAprobar(oc: OrdenCompra) {
    if (!user || !puedeAprobar) return
    setAprobandoId(oc.id)
    try {
      await aprobarOrdenCompra({
        ordenCompraId: oc.id,
        aprobadorUid: user.uid,
        aprobadorNombre: nombreUsuarioFromAuth(user),
      })
      showToast(`OC ${oc.numero} aprobada. Depósito puede recepcionar.`, 'success')
    } catch (err) {
      showToast(mensajeErrorCompras(err), 'error')
    } finally {
      setAprobandoId(null)
    }
  }

  function abrirNuevaOcDesdeRequisicion(solicitudId: string) {
    setRequisicionParaOc(solicitudId)
    setModalNuevaOc(true)
  }

  function abrirNuevaOcLibre() {
    setRequisicionParaOc(undefined)
    setModalNuevaOc(true)
  }

  const tabClass = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'bg-[#CD1818] text-white shadow-sm'
        : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
    }`

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Finanzas / Compras
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
                Bandeja de comprador
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                {puedeCrearOc
                  ? 'Atendé requisiciones internas, emití OC y enviá a aprobación de gerencia.'
                  : puedeAprobar
                    ? 'Vista directiva: aprobá órdenes de compra pendientes antes de la recepción en depósito.'
                    : 'Vista de consulta de requisiciones y órdenes de compra.'}
              </p>
            </div>
            {puedeCrearOc && tab === 'ordenes' ? (
              <button
                type="button"
                onClick={abrirNuevaOcLibre}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nueva OC
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={tabClass(tab === 'solicitudes')}
              onClick={() => setTab('solicitudes')}
            >
              Solicitudes internas
              {requisicionesPendientes.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
                  {requisicionesPendientes.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={tabClass(tab === 'ordenes')}
              onClick={() => setTab('ordenes')}
            >
              Órdenes de compra
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm">Cargando bandeja…</p>
          </div>
        ) : tab === 'solicitudes' ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-3 font-semibold">Origen</th>
                    <th className="px-3 py-3 font-semibold">Fecha pedido</th>
                    <th className="px-3 py-3 font-semibold">Entrega necesaria</th>
                    <th className="px-3 py-3 font-semibold">Prioridad</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 font-semibold">Ítems</th>
                    {puedeCrearOc ? (
                      <th className="px-3 py-3 font-semibold">Acción</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {requisicionesPendientes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={puedeCrearOc ? 7 : 6}
                        className="px-4 py-12 text-center text-neutral-500"
                      >
                        No hay requisiciones internas pendientes.
                      </td>
                    </tr>
                  ) : (
                    requisicionesPendientes.map((s) => (
                      <tr key={s.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                        <td className="px-3 py-3 font-medium text-neutral-800">
                          {s.ubicacionSolicitanteId ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-neutral-600">
                          {formatFechaTimestamp(s.fechaCreacion)}
                        </td>
                        <td className="px-3 py-3 text-neutral-700">
                          {formatYmdLegible(s.fechaEntregaEsperada)}
                        </td>
                        <td className="px-3 py-3 text-neutral-700">{s.prioridad}</td>
                        <td className="px-3 py-3">
                          <BadgeEstadoSolicitud estado={s.estado} />
                        </td>
                        <td className="px-3 py-3 text-xs text-neutral-600">
                          {s.items.map((it) => it.producto).slice(0, 2).join(', ')}
                          {s.items.length > 2 ? ` (+${s.items.length - 2})` : ''}
                        </td>
                        {puedeCrearOc ? (
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => abrirNuevaOcDesdeRequisicion(s.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#CD1818]/10 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/15"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Crear OC
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {borradores.length > 0 ? (
              <section>
                <h2 className="mb-3 text-base font-semibold text-neutral-900">
                  Borradores
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                    {borradores.length}
                  </span>
                </h2>
                <TablaOc
                  filas={borradores}
                  puedeEnviar={puedeEnviar}
                  enviandoId={enviandoId}
                  onEnviar={(oc) => void handleEnviarAprobacion(oc)}
                />
              </section>
            ) : null}

            <section>
              <h2 className="mb-3 text-base font-semibold text-neutral-900">
                Pendientes de aprobación
                <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                  {pendientesAprobacion.length}
                </span>
              </h2>
              <TablaOc
                filas={pendientesAprobacion}
                puedeAprobar={puedeAprobar}
                aprobandoId={aprobandoId}
                onAprobar={(oc) => void handleAprobar(oc)}
              />
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-neutral-900">Historial reciente</h2>
              <TablaOc filas={historialOc.slice(0, 30)} />
            </section>
          </div>
        )}
      </div>

      <NuevaOrdenCompraModal
        open={modalNuevaOc}
        onClose={() => {
          setModalNuevaOc(false)
          setRequisicionParaOc(undefined)
        }}
        proveedores={proveedores}
        insumos={insumos}
        requisicionesPendientes={requisicionesPendientes}
        solicitudMercaderiaIdInicial={requisicionParaOc}
      />
    </div>
  )
}

function TablaOc({
  filas,
  puedeEnviar,
  puedeAprobar,
  aprobandoId,
  enviandoId,
  onAprobar,
  onEnviar,
}: {
  filas: OrdenCompra[]
  puedeEnviar?: boolean
  puedeAprobar?: boolean
  aprobandoId?: string | null
  enviandoId?: string | null
  onAprobar?: (oc: OrdenCompra) => void
  onEnviar?: (oc: OrdenCompra) => void
}) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500">
        No hay órdenes en esta bandeja.
      </p>
    )
  }

  const mostrarEnviar = Boolean(onEnviar && puedeEnviar)
  const mostrarAprobar = Boolean(onAprobar && puedeAprobar)

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-3 font-semibold">Nº OC</th>
              <th className="px-3 py-3 font-semibold">Proveedor</th>
              <th className="px-3 py-3 font-semibold">Estado</th>
              <th className="px-3 py-3 font-semibold">Entrega est.</th>
              <th className="px-3 py-3 text-right font-semibold">Total</th>
              <th className="px-3 py-3 font-semibold">Ítems</th>
              {mostrarEnviar || mostrarAprobar ? (
                <th className="px-3 py-3 font-semibold">Acción</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filas.map((oc) => (
              <tr key={oc.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                <td className="px-3 py-3 font-mono text-xs font-semibold">{oc.numero}</td>
                <td className="px-3 py-3 text-neutral-700">{oc.proveedorNombre}</td>
                <td className="px-3 py-3">
                  <EstadoOcBadge estado={oc.estado} />
                </td>
                <td className="px-3 py-3 text-neutral-600">
                  {formatYmdLegible(oc.fechaEntregaEstimada)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">
                  {formatMonedaCompra(oc.total, oc.moneda)}
                </td>
                <td className="px-3 py-3 text-xs text-neutral-600">
                  {oc.items.length} línea{oc.items.length === 1 ? '' : 's'}
                </td>
                {mostrarEnviar || mostrarAprobar ? (
                  <td className="px-3 py-3">
                    {mostrarEnviar && oc.estado === 'BORRADOR' ? (
                      <button
                        type="button"
                        disabled={enviandoId === oc.id}
                        onClick={() => onEnviar!(oc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {enviandoId === oc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Enviar a aprobación
                      </button>
                    ) : null}
                    {mostrarAprobar && oc.estado === 'PENDIENTE_APROBACION' ? (
                      <button
                        type="button"
                        disabled={aprobandoId === oc.id}
                        onClick={() => onAprobar!(oc)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {aprobandoId === oc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Aprobar
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
