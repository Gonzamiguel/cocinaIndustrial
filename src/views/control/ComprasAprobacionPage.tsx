import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, FileText, Loader2, Paperclip, Plus, Receipt, Truck } from 'lucide-react'
import { ProveedorPerfilLink } from '../../components/compras/ProveedorPerfilLink'
import { useAuth } from '../../context/AuthContext'
import { puedeOperarFinanzas } from '../../lib/rbac'
import { NuevaOrdenCompraModal } from '../../components/compras/NuevaOrdenCompraModal'
import { NuevaFacturaModal } from '../../components/tesoreria/NuevaFacturaModal'
import { EstadoOcBadge } from '../../components/compras/EstadoOcBadge'
import {
  formatFechaTimestamp,
  formatMonedaCompra,
  formatYmdLegible,
} from '../../lib/comprasUi'
import {
  esRequisicionCompra,
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudesMercaderia,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import {
  filtrarOcPendientesFacturar,
  fechaRecepcionOc,
  saldoAFacturarOc,
  subscribeOrdenesCompra,
  subscribeProveedoresTesoreria,
  type ProveedorTesoreria,
} from '../../lib/tesoreriaQueries'
import { ocTieneComprobanteDeposito } from '../../lib/comprasQueries'
import { subscribeDocumentosPorEntidadTipo } from '../../lib/documentos'
import type { DocumentoAdjunto } from '../../types/documentos'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import type { OrdenCompra } from '../../types/compras'

type TabCompras = 'solicitudes' | 'ordenes' | 'pendientesFacturar'

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
  const { rol } = useAuth()
  const puedeCrearOc = puedeOperarFinanzas(rol)
  const puedeFacturar = puedeOperarFinanzas(rol)

  const [tab, setTab] = useState<TabCompras>('solicitudes')
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [proveedores, setProveedores] = useState<ProveedorTesoreria[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalNuevaOc, setModalNuevaOc] = useState(false)
  const [modalFactura, setModalFactura] = useState(false)
  const [facturaOcPreset, setFacturaOcPreset] = useState<{
    ordenCompraId: string
    proveedorId: string
  } | null>(null)
  const [requisicionParaOc, setRequisicionParaOc] = useState<string | undefined>()
  const [documentosOc, setDocumentosOc] = useState<DocumentoAdjunto[]>([])

  useEffect(() => {
    const unsub = subscribeDocumentosPorEntidadTipo('ORDEN_COMPRA', setDocumentosOc)
    return () => unsub()
  }, [])

  const documentosPorOcId = useMemo(() => {
    const map = new Map<string, DocumentoAdjunto[]>()
    for (const doc of documentosOc) {
      const ocId = doc.ordenCompraId?.trim() || doc.entidadId
      if (!ocId) continue
      const list = map.get(ocId) ?? []
      list.push(doc)
      map.set(ocId, list)
    }
    return map
  }, [documentosOc])

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

  const listasRecepcion = useMemo(
    () => ordenes.filter((oc) => oc.estado === 'APROBADA'),
    [ordenes],
  )

  const historialOc = useMemo(
    () =>
      ordenes.filter((oc) =>
        ['RECIBIDA_PARCIAL', 'COMPLETADA', 'CANCELADA'].includes(oc.estado),
      ),
    [ordenes],
  )

  const legacyPendientes = useMemo(
    () =>
      ordenes.filter((oc) =>
        ['BORRADOR', 'PENDIENTE_APROBACION'].includes(oc.estado),
      ),
    [ordenes],
  )

  const ocPendientesFacturar = useMemo(
    () => filtrarOcPendientesFacturar(ordenes),
    [ordenes],
  )

  function abrirNuevaOcDesdeRequisicion(solicitudId: string) {
    setRequisicionParaOc(solicitudId)
    setModalNuevaOc(true)
  }

  function abrirNuevaOcLibre() {
    setRequisicionParaOc(undefined)
    setModalNuevaOc(true)
  }

  function abrirFacturaDesdeOc(oc: OrdenCompra) {
    setFacturaOcPreset({ ordenCompraId: oc.id, proveedorId: oc.proveedorId })
    setModalFactura(true)
  }

  function cerrarModalFactura() {
    setModalFactura(false)
    setFacturaOcPreset(null)
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
              <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                Bandeja de comprador
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                Las OC se emiten aprobadas y quedan disponibles para recepción en depósito.
              </p>
            </div>
            {puedeCrearOc && tab === 'ordenes' ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/control/proveedores"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
                >
                  <Truck className="h-4 w-4" aria-hidden />
                  Proveedores
                </Link>
                <button
                  type="button"
                  onClick={abrirNuevaOcLibre}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Nueva OC
                </button>
              </div>
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
            <button
              type="button"
              className={tabClass(tab === 'pendientesFacturar')}
              onClick={() => setTab('pendientesFacturar')}
            >
              Pendientes de facturar
              {ocPendientesFacturar.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
                  {ocPendientesFacturar.length}
                </span>
              ) : null}
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
        ) : tab === 'pendientesFacturar' ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 bg-amber-50/60 px-4 py-3 sm:px-6">
              <p className="text-sm text-amber-900">
                OC recibidas en depósito. Si ya hay remito/factura archivado, usá Registrar factura:
                los montos y el número se completan solos desde la recepción.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-3 font-semibold">Nº OC</th>
                    <th className="px-3 py-3 font-semibold">Proveedor</th>
                    <th className="px-3 py-3 font-semibold">Recepción</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 font-semibold">Comprob. depósito</th>
                    <th className="px-3 py-3 text-right font-semibold">Saldo a facturar</th>
                    {puedeFacturar ? (
                      <th className="px-3 py-3 font-semibold">Acción</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {ocPendientesFacturar.length === 0 ? (
                    <tr>
                      <td
                        colSpan={puedeFacturar ? 7 : 6}
                        className="px-4 py-12 text-center text-neutral-500"
                      >
                        No hay OC pendientes de facturar. Cuando depósito confirme un ingreso,
                        aparecerán acá.
                      </td>
                    </tr>
                  ) : (
                    ocPendientesFacturar.map((oc) => {
                      const recepcion = fechaRecepcionOc(oc)
                      const docsOc = documentosPorOcId.get(oc.id) ?? []
                      const tieneComprobante = ocTieneComprobanteDeposito(docsOc)
                      return (
                        <tr
                          key={oc.id}
                          className="border-b border-neutral-50 hover:bg-neutral-50/60"
                        >
                          <td className="px-3 py-3 font-mono text-xs font-semibold">
                            <Link
                              to={`/control/compras/${oc.id}`}
                              className="inline-flex items-center gap-1 text-[#CD1818] hover:underline"
                            >
                              {oc.numero}
                              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-neutral-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{oc.proveedorNombre}</span>
                              <ProveedorPerfilLink
                                proveedorId={oc.proveedorId}
                                variant="icon"
                                title={`Ver perfil de ${oc.proveedorNombre}`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-neutral-600">
                            {recepcion ? recepcion.toLocaleDateString('es-AR') : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <EstadoOcBadge estado={oc.estado} />
                          </td>
                          <td className="px-3 py-3">
                            {tieneComprobante ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                <Paperclip className="h-3 w-3" aria-hidden />
                                Listo
                              </span>
                            ) : (
                              <span className="text-xs text-amber-700">Esperando depósito</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium text-amber-800">
                            {formatMonedaCompra(saldoAFacturarOc(oc), oc.moneda)}
                          </td>
                          {puedeFacturar ? (
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => abrirFacturaDesdeOc(oc)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#CD1818]/10 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/15"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                Registrar factura
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-base font-semibold text-neutral-900">
                Listas para recepción (depósito)
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {listasRecepcion.length}
                </span>
              </h2>
              <TablaOc filas={listasRecepcion} />
            </section>

            {legacyPendientes.length > 0 ? (
              <section>
                <h2 className="mb-1 text-base font-semibold text-neutral-900">
                  Órdenes legacy sin emitir
                </h2>
                <p className="mb-3 text-sm text-neutral-500">
                  Borradores o pendientes de aprobación de versiones anteriores. Emití una OC nueva
                  si corresponde reemplazarlas.
                </p>
                <TablaOc filas={legacyPendientes} />
              </section>
            ) : null}

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

      <NuevaFacturaModal
        open={modalFactura}
        onClose={cerrarModalFactura}
        proveedores={proveedores}
        ordenesCompra={ordenes}
        ordenCompraIdInicial={facturaOcPreset?.ordenCompraId}
        proveedorIdInicial={facturaOcPreset?.proveedorId}
      />
    </div>
  )
}

function TablaOc({ filas }: { filas: OrdenCompra[] }) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500">
        No hay órdenes en esta bandeja.
      </p>
    )
  }

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
            </tr>
          </thead>
          <tbody>
            {filas.map((oc) => (
              <tr key={oc.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                <td className="px-3 py-3 font-mono text-xs font-semibold">
                  <Link
                    to={`/control/compras/${oc.id}`}
                    className="inline-flex items-center gap-1 text-[#CD1818] hover:underline"
                    title="Ver expediente de la OC"
                  >
                    {oc.numero}
                    <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                  </Link>
                </td>
                <td className="px-3 py-3 text-neutral-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{oc.proveedorNombre}</span>
                    <ProveedorPerfilLink
                      proveedorId={oc.proveedorId}
                      variant="icon"
                      title={`Ver perfil de ${oc.proveedorNombre}`}
                    />
                  </div>
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
