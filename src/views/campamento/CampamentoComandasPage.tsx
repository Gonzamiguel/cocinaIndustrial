import { useEffect, useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  costoTotalItemsMovimiento,
  subscribeMovimientosInventarioPorUbicacion,
  type MovimientoEgreso,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import { esComandaConsumoDiario } from './comandasFormShared'

const ITEMS_POR_PAGINA = 15

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoneda(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function inicioDiaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function finDiaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export function CampamentoComandasPage() {
  const { ubicacionId } = useAuth()
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [busquedaObs, setBusquedaObs] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  useEffect(() => {
    if (!ubicacionId) {
      setMovimientos([])
      return
    }
    return subscribeMovimientosInventarioPorUbicacion(ubicacionId, setMovimientos)
  }, [ubicacionId])

  const todasLasComandas = useMemo(
    () => movimientos.filter(esComandaConsumoDiario),
    [movimientos],
  )

  const comandasFiltradas = useMemo(() => {
    let rows = todasLasComandas
    const q = normalizarTexto(busquedaObs)
    if (q) {
      rows = rows.filter((m) =>
        normalizarTexto(m.observacionesComanda ?? '').includes(q),
      )
    }
    if (fechaDesde.trim()) {
      const d0 = inicioDiaLocal(fechaDesde.trim())
      rows = rows.filter((m) => m.fecha != null && m.fecha >= d0)
    }
    if (fechaHasta.trim()) {
      const d1 = finDiaLocal(fechaHasta.trim())
      rows = rows.filter((m) => m.fecha != null && m.fecha <= d1)
    }
    return rows
  }, [todasLasComandas, busquedaObs, fechaDesde, fechaHasta])

  const totalPaginas = Math.max(1, Math.ceil(comandasFiltradas.length / ITEMS_POR_PAGINA))

  useEffect(() => {
    setPaginaActual(1)
  }, [busquedaObs, fechaDesde, fechaHasta])

  useEffect(() => {
    setPaginaActual((p) => Math.min(Math.max(1, p), totalPaginas))
  }, [totalPaginas])

  const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA
  const comandasPagina = comandasFiltradas.slice(inicio, inicio + ITEMS_POR_PAGINA)

  const movimientoDetalle = useMemo(() => {
    if (!detalleId) return null
    return todasLasComandas.find((m) => m.id === detalleId) ?? null
  }, [detalleId, todasLasComandas])

  if (!ubicacionId) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-6">
        <p className="text-center text-sm text-neutral-600">
          No hay sucursal asignada. Configurá{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">ubicacionId</code> en tu usuario.
        </p>
      </div>
    )
  }

  const ub = ubicacionId.trim().toUpperCase()

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <ClipboardList
              className="mt-0.5 h-7 w-7 shrink-0 text-[#CD1818]"
              strokeWidth={1.75}
              aria-hidden
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Comandas de consumo diario
              </h1>
              <p className="mt-1 text-sm text-[#8997A6]">
                Historial de egresos por consumo en{' '}
                <span className="font-mono text-xs text-[#171717]">{ub}</span>.
              </p>
            </div>
          </div>
          <Link
            to="/campamento/comandas/nueva"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Nueva comanda
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-[#171717]">
            Historial de comandas recientes
          </h2>
          <p className="mt-1 text-sm text-[#8997A6]">
            {comandasFiltradas.length}{' '}
            {comandasFiltradas.length === 1 ? 'registro' : 'registros'} con los filtros actuales.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
            <label className="block min-w-0">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Buscar en observaciones
              </span>
              <input
                type="search"
                value={busquedaObs}
                onChange={(e) => setBusquedaObs(e.target.value)}
                placeholder="Texto libre…"
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Desde
              </span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Hasta
              </span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Observaciones</th>
                  <th className="px-4 py-3">Ítems</th>
                  <th className="px-4 py-3">Costo total</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comandasPagina.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[#8997A6]">
                      No hay comandas que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  comandasPagina.map((m) => (
                    <tr key={m.id} className="bg-white hover:bg-gray-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                        {formatFechaHora(m.fecha)}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-[#171717]">
                        {m.observacionesComanda?.trim() || '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#171717]">
                        {m.items.length}
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-[#171717]">
                        {formatMoneda(costoTotalItemsMovimiento(m.items))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetalleId(m.id)}
                          className="text-sm font-semibold text-[#CD1818] underline-offset-4 hover:underline"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {comandasFiltradas.length > ITEMS_POR_PAGINA ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm text-[#8997A6]">
              <span>
                Página {paginaActual} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={paginaActual <= 1}
                  onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                  className="min-h-10 rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#171717] shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={paginaActual >= totalPaginas}
                  onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                  className="min-h-10 rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#171717] shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {movimientoDetalle ? (
        <ComandaDetalleModal
          mov={movimientoDetalle}
          onClose={() => setDetalleId(null)}
          formatFechaHora={formatFechaHora}
          formatMoneda={formatMoneda}
        />
      ) : null}
    </div>
  )
}

function ComandaDetalleModal({
  mov,
  onClose,
  formatFechaHora,
  formatMoneda,
}: {
  mov: MovimientoEgreso
  onClose: () => void
  formatFechaHora: (d: Date | null) => string
  formatMoneda: (n: number) => string
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-comanda-titulo"
        className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 id="modal-comanda-titulo" className="text-lg font-semibold text-[#171717]">
            Detalle de la comanda
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#8997A6] transition hover:bg-gray-100 hover:text-[#171717]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid gap-2 text-sm text-[#171717]">
            <div>
              <dt className="text-xs font-medium text-[#8997A6]">Fecha</dt>
              <dd className="mt-0.5">{formatFechaHora(mov.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#8997A6]">Documento</dt>
              <dd className="mt-0.5 font-mono text-xs">{mov.numeroDocumento}</dd>
            </div>
            {mov.observacionesComanda?.trim() ? (
              <div>
                <dt className="text-xs font-medium text-[#8997A6]">Observaciones</dt>
                <dd className="mt-0.5">{mov.observacionesComanda}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
            Insumos consumidos
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[400px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-[#8997A6]">
                  <th className="px-3 py-2 font-semibold">Insumo</th>
                  <th className="px-3 py-2 font-semibold">Lote</th>
                  <th className="px-3 py-2 font-semibold">Cant.</th>
                  <th className="px-3 py-2 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mov.items.map((it, idx) => {
                  const cu = Number(it.costoPorUnidadBaseSnapshot)
                  const unit = Number.isFinite(cu) && cu >= 0 ? cu : 0
                  const sub = Math.abs(Number(it.cantidad)) * unit
                  return (
                    <tr key={`${it.insumoId}-${idx}`}>
                      <td className="px-3 py-2">{it.nombreSnapshot}</td>
                      <td className="px-3 py-2 text-xs text-[#8997A6]">
                        {it.lote?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {Number(it.cantidad).toLocaleString('es-AR', {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium">
                        {formatMoneda(sub)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-sm font-semibold text-[#171717]">
            Total: {formatMoneda(costoTotalItemsMovimiento(mov.items))}
          </p>
        </div>
        <div className="flex shrink-0 justify-end border-t border-gray-100 bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
