import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Factory, Package, Search, Truck, Wheat } from 'lucide-react'
import {
  filtrarDespachosPorProduccionId,
  subscribeDespachosViandas,
  type DespachoViandaRegistro,
} from '../../lib/despachosViandas'
import {
  fetchProduccionCocinaById,
  subscribeProduccionCocinaRegistros,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'

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

function buscarProduccion(
  producciones: ProduccionCocinaRegistro[],
  q: string,
): ProduccionCocinaRegistro | null {
  const term = q.trim().toLowerCase()
  if (!term) return null
  const byId = producciones.find((p) => p.id === q.trim())
  if (byId) return byId
  return (
    producciones.find(
      (p) =>
        p.loteProducto.toLowerCase() === term ||
        p.codigoTrazabilidad.toLowerCase() === term ||
        p.loteProducto.toLowerCase().includes(term) ||
        p.codigoTrazabilidad.toLowerCase().includes(term),
    ) ?? null
  )
}

export function AdminTrazabilidadViandaPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [producciones, setProducciones] = useState<ProduccionCocinaRegistro[]>([])
  const [despachos, setDespachos] = useState<DespachoViandaRegistro[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [seleccionada, setSeleccionada] = useState<ProduccionCocinaRegistro | null>(null)
  const [cargandoId, setCargandoId] = useState(false)

  const paramProduccionId = searchParams.get('produccionId')?.trim() ?? ''
  const paramLote = searchParams.get('lote')?.trim() ?? ''
  const paramCodigo = searchParams.get('codigo')?.trim() ?? ''

  useEffect(() => subscribeProduccionCocinaRegistros(setProducciones, 500), [])
  useEffect(() => subscribeDespachosViandas(setDespachos, 400), [])

  useEffect(() => {
    const q = paramProduccionId || paramLote || paramCodigo
    if (!q) return
    setBusqueda(q)
  }, [paramProduccionId, paramLote, paramCodigo])

  useEffect(() => {
    async function resolver() {
      const q = paramProduccionId || paramLote || paramCodigo || busqueda.trim()
      if (!q) {
        setSeleccionada(null)
        return
      }

      if (paramProduccionId) {
        setCargandoId(true)
        try {
          const directa = await fetchProduccionCocinaById(paramProduccionId)
          if (directa) {
            setSeleccionada(directa)
            return
          }
        } finally {
          setCargandoId(false)
        }
      }

      const local = buscarProduccion(producciones, q)
      setSeleccionada(local)
    }
    void resolver()
  }, [paramProduccionId, paramLote, paramCodigo, busqueda, producciones])

  const despachosRelacionados = useMemo(
    () =>
      seleccionada
        ? filtrarDespachosPorProduccionId(despachos, seleccionada.id)
        : [],
    [despachos, seleccionada],
  )

  function handleBuscar(e: FormEvent) {
    e.preventDefault()
    const q = busqueda.trim()
    if (!q) return
    setSearchParams({ produccionId: q })
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/admin/menu')}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#8997A6] hover:text-[#CD1818]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a gestión de menú
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818] sm:text-2xl">
          Historia de la vianda
        </h1>
        <form onSubmit={handleBuscar} className="mt-4 flex max-w-xl flex-wrap gap-2">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Lote, código QR o ID de producción…"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white hover:brightness-105"
          >
            <Search className="h-4 w-4" aria-hidden />
            Buscar
          </button>
        </form>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        {cargandoId ? (
          <p className="text-sm text-[#8997A6]">Cargando producción…</p>
        ) : !seleccionada ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-[#8997A6]">
            Buscá por lote de producción (ej. P-20260524-CARNE), código de etiqueta o ID interno.
          </p>
        ) : (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[#171717]">{seleccionada.nombreProducto}</p>
                  <p className="mt-1 text-sm text-[#8997A6]">
                    Receta: {seleccionada.recetaNombre} · {seleccionada.cantidadPorciones} viandas
                    producidas
                  </p>
                  <p className="mt-1 font-mono text-xs text-[#8997A6]">
                    Lote {seleccionada.loteProducto} · Vto {seleccionada.fechaVencimiento}
                  </p>
                  {seleccionada.codigoTrazabilidad ? (
                    <p className="mt-0.5 font-mono text-xs text-[#8997A6]">
                      Código: {seleccionada.codigoTrazabilidad}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-[#8997A6]">{formatFechaHora(seleccionada.fecha)}</p>
              </div>
            </section>

            <div className="relative ml-4 space-y-6 border-l-2 border-[#CD1818]/20 pl-6">
              <article className="relative">
                <span className="absolute -left-[1.85rem] flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <Wheat className="h-4 w-4" aria-hidden />
                </span>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                    1 · Insumos usados en cocina
                  </p>
                  <p className="mt-1 text-xs text-[#8997A6]">
                    Lo que reportó cocina al producir este lote (teórico vs real).
                  </p>
                  {seleccionada.itemsDetalle.length === 0 ? (
                    <p className="mt-3 text-sm text-[#8997A6]">Sin detalle de insumos guardado.</p>
                  ) : (
                    <table className="mt-3 w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-[#8997A6]">
                          <th className="pb-2 pr-3">Insumo</th>
                          <th className="pb-2 pr-3 text-right">Ficha</th>
                          <th className="pb-2 pr-3 text-right">Real</th>
                          <th className="pb-2">Lote insumo</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {seleccionada.itemsDetalle.map((item, idx) => (
                          <tr key={`${item.insumoId}-${idx}`}>
                            <td className="py-2 pr-3">
                              {item.nombre}
                              {item.unidad ? (
                                <span className="text-xs text-[#8997A6]"> ({item.unidad})</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-[#8997A6]">
                              {item.cantidadTeorica.toLocaleString('es-AR', {
                                maximumFractionDigits: 4,
                              })}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums font-medium">
                              {item.cantidadReal > 0
                                ? item.cantidadReal.toLocaleString('es-AR', {
                                    maximumFractionDigits: 4,
                                  })
                                : '—'}
                            </td>
                            <td className="py-2 font-mono text-xs">{item.loteInsumo || '—'}</td>
                            <td className="py-2 text-right">
                              {item.loteInsumo ? (
                                <Link
                                  to={`/deposito/trazabilidad?lote=${encodeURIComponent(item.loteInsumo)}`}
                                  className="text-xs font-semibold text-[#CD1818] hover:underline"
                                >
                                  Origen en depósito
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </article>

              <article className="relative">
                <span className="absolute -left-[1.85rem] flex h-8 w-8 items-center justify-center rounded-full bg-[#CD1818]/10 text-[#CD1818]">
                  <Factory className="h-4 w-4" aria-hidden />
                </span>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                    2 · Producción del lote
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-[#171717]">
                    <li>
                      <span className="text-[#8997A6]">Viandas:</span>{' '}
                      {seleccionada.cantidadPorciones}
                    </li>
                    <li>
                      <span className="text-[#8997A6]">Costo teórico:</span>{' '}
                      {seleccionada.costoTeorico.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </li>
                    <li>
                      <span className="text-[#8997A6]">Costo real:</span>{' '}
                      {seleccionada.costoReal.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      <span className="text-xs text-[#8997A6]">
                        ({seleccionada.desvioPorcentaje.toFixed(1)}% desvío)
                      </span>
                    </li>
                  </ul>
                </div>
              </article>

              <article className="relative">
                <span className="absolute -left-[1.85rem] flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-800">
                  <Truck className="h-4 w-4" aria-hidden />
                </span>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                    3 · Despachos a empresas
                  </p>
                  {despachosRelacionados.length === 0 ? (
                    <p className="mt-3 text-sm text-[#8997A6]">
                      Este lote todavía no fue despachado en un remito.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {despachosRelacionados.map((d) => {
                        const lineas = d.items.flatMap((it) =>
                          it.lotes
                            .filter((l) => l.produccionId === seleccionada.id)
                            .map((l) => ({
                              plato: it.nombrePlato,
                              cantidad: l.cantidad,
                            })),
                        )
                        return (
                          <li
                            key={d.id}
                            className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm"
                          >
                            <p className="font-semibold text-[#171717]">{d.empresa}</p>
                            <p className="text-xs text-[#8997A6]">
                              Remito {d.numeroRemito || d.id.slice(0, 8)} ·{' '}
                              {formatFechaHora(d.fecha)}
                              {d.lugarEntrega ? ` · ${d.lugarEntrega}` : ''}
                            </p>
                            <ul className="mt-1 text-xs text-[#171717]">
                              {lineas.map((ln, i) => (
                                <li key={i}>
                                  {ln.cantidad} × {ln.plato}
                                </li>
                              ))}
                            </ul>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </article>

              <article className="relative">
                <span className="absolute -left-[1.85rem] flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                  <Package className="h-4 w-4" aria-hidden />
                </span>
                <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-[#8997A6]">
                  Stock restante de este lote: consultalo en{' '}
                  <Link to="/admin/menu" className="font-semibold text-[#CD1818] hover:underline">
                    Gestión de menú
                  </Link>{' '}
                  expandiendo el plato correspondiente.
                </div>
              </article>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
