import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Truck } from 'lucide-react'
import { NuevaRequisicionCompraModal } from '../../components/compras/NuevaRequisicionCompraModal'
import { RecepcionOcModal } from '../../components/compras/RecepcionOcModal'
import { EstadoOcBadge } from '../../components/compras/EstadoOcBadge'
import { subscribeInsumos } from '../../lib/insumos'
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
import { UBICACION_DEPOSITO_CENTRAL } from '../../lib/movimientosInventario'
import { subscribeOrdenesCompra } from '../../lib/tesoreriaQueries'
import type { OrdenCompra } from '../../types/compras'
import type { Insumo } from '../../lib/insumos'

type TabDepositoCompras = 'requisiciones' | 'oc-entrantes'

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

export function DepositoOrdenesCompraPage() {
  const [tab, setTab] = useState<TabDepositoCompras>('requisiciones')
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalRequisicion, setModalRequisicion] = useState(false)
  const [ordenRecepcion, setOrdenRecepcion] = useState<OrdenCompra | null>(null)
  const [filtroEstadoOc, setFiltroEstadoOc] = useState('')

  useEffect(() => {
    let pending = 3
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
      subscribeInsumos((rows) => {
        setInsumos(rows)
        done()
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const requisicionesDeposito = useMemo(
    () =>
      solicitudes.filter(
        (s) =>
          esRequisicionCompra(s) &&
          (s.ubicacionSolicitanteId === UBICACION_DEPOSITO_CENTRAL ||
            !s.ubicacionSolicitanteId),
      ),
    [solicitudes],
  )

  const ordenesRecepcion = useMemo(() => {
    return ordenes.filter((oc) => {
      if (filtroEstadoOc && oc.estado !== filtroEstadoOc) return false
      return ['APROBADA', 'RECIBIDA_PARCIAL', 'COMPLETADA', 'PENDIENTE_APROBACION'].includes(
        oc.estado,
      )
    })
  }, [ordenes, filtroEstadoOc])

  const tabClass = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'bg-[#CD1818] text-white shadow-sm'
        : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
    }`

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Compras
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
              Requisiciones y recepción
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Pedí mercadería al área de Compras/Gerencia y seguí el estado de las OC aprobadas
              que van a llegar al depósito.
            </p>
          </div>
          {tab === 'requisiciones' ? (
            <button
              type="button"
              onClick={() => setModalRequisicion(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nueva requisición
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={tabClass(tab === 'requisiciones')} onClick={() => setTab('requisiciones')}>
            Mis requisiciones
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
              {requisicionesDeposito.length}
            </span>
          </button>
          <button type="button" className={tabClass(tab === 'oc-entrantes')} onClick={() => setTab('oc-entrantes')}>
            OC entrantes
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm">Cargando…</p>
          </div>
        ) : tab === 'requisiciones' ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-3 font-semibold">Fecha pedido</th>
                    <th className="px-3 py-3 font-semibold">Entrega necesaria</th>
                    <th className="px-3 py-3 font-semibold">Prioridad</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 font-semibold">Ítems</th>
                    <th className="px-3 py-3 font-semibold">OC vinculada</th>
                  </tr>
                </thead>
                <tbody>
                  {requisicionesDeposito.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                        No hay requisiciones. Creá la primera con «Nueva requisición».
                      </td>
                    </tr>
                  ) : (
                    requisicionesDeposito.map((s) => (
                      <tr key={s.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
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
                          {s.items.length} línea{s.items.length === 1 ? '' : 's'}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-neutral-700">
                          {s.ordenCompraNumero ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                value={filtroEstadoOc}
                onChange={(e) => setFiltroEstadoOc(e.target.value)}
                className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40"
                aria-label="Filtrar OC por estado"
              >
                <option value="">Estados de recepción</option>
                <option value="PENDIENTE_APROBACION">Pendiente aprobación</option>
                <option value="APROBADA">Aprobada</option>
                <option value="RECIBIDA_PARCIAL">Recibida parcial</option>
                <option value="COMPLETADA">Completada</option>
              </select>
              <p className="text-xs text-neutral-500">
                Solo lectura y recepción. Las OC las emite Compras/Gerencia.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-3 font-semibold">Nº OC</th>
                      <th className="px-3 py-3 font-semibold">Proveedor</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">Entrega est.</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesRecepcion.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                          No hay órdenes de compra visibles para recepción.
                        </td>
                      </tr>
                    ) : (
                      ordenesRecepcion.map((oc) => (
                        <tr key={oc.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                          <td className="px-3 py-3 font-mono text-xs font-semibold text-neutral-900">
                            {oc.numero}
                          </td>
                          <td className="px-3 py-3 text-neutral-700">{oc.proveedorNombre}</td>
                          <td className="px-3 py-3">
                            <EstadoOcBadge estado={oc.estado} />
                          </td>
                          <td className="px-3 py-3 text-neutral-600">
                            {formatYmdLegible(oc.fechaEntregaEstimada)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium text-neutral-900">
                            {formatMonedaCompra(oc.total, oc.moneda)}
                          </td>
                          <td className="px-3 py-3">
                            {oc.estado === 'APROBADA' || oc.estado === 'RECIBIDA_PARCIAL' ? (
                              <button
                                type="button"
                                onClick={() => setOrdenRecepcion(oc)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                <Truck className="h-3 w-3" />
                                Recibir
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <NuevaRequisicionCompraModal
        open={modalRequisicion}
        onClose={() => setModalRequisicion(false)}
        insumos={insumos}
      />

      <RecepcionOcModal
        open={Boolean(ordenRecepcion)}
        orden={ordenRecepcion}
        onClose={() => setOrdenRecepcion(null)}
      />
    </div>
  )
}
