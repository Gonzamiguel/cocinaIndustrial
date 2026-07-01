import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { NuevaRequisicionCompraModal } from '../../components/compras/NuevaRequisicionCompraModal'
import { subscribeInsumos } from '../../lib/insumos'
import { formatFechaTimestamp, formatYmdLegible } from '../../lib/comprasUi'
import {
  esRequisicionCompra,
  estiloBadgeEstadoSolicitud,
  subscribeSolicitudesMercaderia,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import { UBICACION_DEPOSITO_CENTRAL } from '../../lib/movimientosInventario'
import type { Insumo } from '../../lib/insumos'

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
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalRequisicion, setModalRequisicion] = useState(false)

  useEffect(() => {
    let pending = 2
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Solicitud a compras
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Pedidos internos a compras. La recepción de mercadería se hace desde{' '}
              <span className="font-medium text-neutral-700">Movimientos → Nuevo ingreso</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalRequisicion(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nueva requisición
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm">Cargando…</p>
          </div>
        ) : (
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
        )}
      </div>

      <NuevaRequisicionCompraModal
        open={modalRequisicion}
        onClose={() => setModalRequisicion(false)}
        insumos={insumos}
      />
    </div>
  )
}
