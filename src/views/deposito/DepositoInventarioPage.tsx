import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscribeCategorias, type Categoria } from '../../lib/categorias'
import {
  subscribeMovimientosInventario,
  movimientosEnUbicacion,
  opcionesHistorialAmplio,
  UBICACION_DEPOSITO_CENTRAL,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'

const ITEMS_POR_PAGINA = 50

type LoteResumen = {
  lote: string
  fechaVencimiento: string | null
  stock: number
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getDeltaMovimiento(
  tipo: MovimientoInventario['tipo'],
  cantidad: number,
): number {
  if (tipo === 'INGRESO') return Math.abs(cantidad)
  if (tipo === 'EGRESO' || tipo === 'DECOMISO') return -Math.abs(cantidad)
  return cantidad
}

function formatCantidad(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
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

function formatFechaVencimiento(value: string | null): string {
  if (!value) return 'Sin fecha'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

function parseFechaIso(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isFinite(date.getTime()) ? date : null
}

function obtenerEstadoVencimiento(fechaIso: string | null): {
  className: string
  label: string
} {
  const fecha = parseFechaIso(fechaIso)
  if (!fecha) {
    return {
      className: 'text-[#8997A6] bg-gray-50',
      label: 'Sin fecha',
    }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  fecha.setHours(0, 0, 0, 0)
  const diffDias = Math.ceil(
    (fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
  )

  if (diffDias < 0) {
    return {
      className: 'text-red-700 bg-red-50',
      label: 'Vencido',
    }
  }
  if (diffDias < 7) {
    return {
      className: 'text-red-700 bg-red-50',
      label: 'Vence pronto',
    }
  }
  if (diffDias < 30) {
    return {
      className: 'text-yellow-700 bg-yellow-50',
      label: 'Próximo a vencer',
    }
  }
  return {
    className: 'text-green-700 bg-green-50',
    label: 'Vigente',
  }
}

function sortLotesFefo(a: LoteResumen, b: LoteResumen): number {
  const ta = parseFechaIso(a.fechaVencimiento)?.getTime() ?? Number.POSITIVE_INFINITY
  const tb = parseFechaIso(b.fechaVencimiento)?.getTime() ?? Number.POSITIVE_INFINITY
  if (ta !== tb) return ta - tb
  return a.lote.localeCompare(b.lote, 'es', { sensitivity: 'base' })
}

export function DepositoInventarioPage() {
  const navigate = useNavigate()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [query, setQuery] = useState('')
  const [filtroRubro, setFiltroRubro] = useState('')
  const [filtroSubrubro, setFiltroSubrubro] = useState('')
  const [ocultarSinStock, setOcultarSinStock] = useState(true)
  const [paginaActual, setPaginaActual] = useState(1)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    return subscribeMovimientosInventario(
      setMovimientos,
      opcionesHistorialAmplio(45000),
    )
  }, [])

  useEffect(() => {
    return subscribeCategorias(setCategorias)
  }, [])

  const filas = useMemo(() => {
    const movimientosCentral = movimientosEnUbicacion(
      movimientos,
      UBICACION_DEPOSITO_CENTRAL,
    )
    const lotesPorInsumo = new Map<string, Map<string, LoteResumen>>()
    const stockPorInsumo = new Map<string, number>()

    for (const mov of movimientosCentral) {
      for (const item of mov.items) {
        const delta = getDeltaMovimiento(mov.tipo, Number(item.cantidad))
        if (!Number.isFinite(delta) || delta === 0) continue

        stockPorInsumo.set(
          item.insumoId,
          (stockPorInsumo.get(item.insumoId) ?? 0) + delta,
        )

        const loteKey = (item.lote?.trim() || '').trim()
        const buckets =
          lotesPorInsumo.get(item.insumoId) ?? new Map<string, LoteResumen>()
        const actual = buckets.get(loteKey) ?? {
          lote: loteKey || 'Sin lote',
          fechaVencimiento: null,
          stock: 0,
        }

        actual.stock += delta

        const fechaItem =
          typeof item.fechaVencimiento === 'string' && item.fechaVencimiento.trim()
            ? item.fechaVencimiento.trim()
            : null

        if (fechaItem) {
          const fechaActualMs =
            parseFechaIso(actual.fechaVencimiento)?.getTime() ?? Number.POSITIVE_INFINITY
          const fechaNuevaMs =
            parseFechaIso(fechaItem)?.getTime() ?? Number.POSITIVE_INFINITY
          if (fechaNuevaMs < fechaActualMs) {
            actual.fechaVencimiento = fechaItem
          }
        }

        buckets.set(loteKey, actual)
        lotesPorInsumo.set(item.insumoId, buckets)
      }
    }

    return [...insumos]
      .sort((a, b) => {
        const byName = a.nombreGenerico.localeCompare(b.nombreGenerico, 'es', {
          sensitivity: 'base',
        })
        if (byName !== 0) return byName
        return a.marca.localeCompare(b.marca, 'es', { sensitivity: 'base' })
      })
      .map((insumo) => {
        const stockTotal = stockPorInsumo.get(insumo.id) ?? 0
        const lotesRaw = [...(lotesPorInsumo.get(insumo.id)?.values() ?? [])]
          .filter((lote) => lote.stock > 0)
          .sort(sortLotesFefo)

        return {
          insumo,
          stockTotal,
          valorizacion: stockTotal * insumo.costoPorUnidadBase,
          lotes: lotesRaw,
        }
      })
  }, [insumos, movimientos])

  const filasFiltradas = useMemo(() => {
    const q = normalizarTexto(query)
    return filas.filter(({ insumo, stockTotal }) => {
      if (ocultarSinStock && stockTotal <= 0) return false
      if (filtroRubro && insumo.rubro !== filtroRubro) return false
      if (filtroSubrubro && insumo.subrubro !== filtroSubrubro) return false
      if (!q) return true
      const nombre = normalizarTexto(insumo.nombreGenerico)
      const marca = normalizarTexto(insumo.marca)
      return nombre.includes(q) || marca.includes(q)
    })
  }, [filas, filtroRubro, filtroSubrubro, ocultarSinStock, query])

  const rubrosDisponibles = useMemo(() => {
    const values = new Map<string, string>()
    for (const categoria of categorias) {
      const nombre = categoria.nombre.trim()
      if (nombre) values.set(nombre.toLocaleLowerCase('es'), nombre)
    }
    for (const { insumo } of filas) {
      const rubro = insumo.rubro.trim()
      if (rubro) values.set(rubro.toLocaleLowerCase('es'), rubro)
    }
    return [...values.values()].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
  }, [categorias, filas])

  const subrubrosDisponibles = useMemo(() => {
    if (!filtroRubro) return []
    const values = new Map<string, string>()
    const categoria = categorias.find((item) => item.nombre === filtroRubro)
    for (const subrubro of categoria?.subrubros ?? []) {
      const nombre = subrubro.trim()
      if (nombre) values.set(nombre.toLocaleLowerCase('es'), nombre)
    }
    for (const { insumo } of filas) {
      if (insumo.rubro !== filtroRubro) continue
      const subrubro = insumo.subrubro.trim()
      if (subrubro) values.set(subrubro.toLocaleLowerCase('es'), subrubro)
    }
    return [...values.values()].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
  }, [categorias, filas, filtroRubro])

  const totalPaginas = Math.max(
    1,
    Math.ceil(filasFiltradas.length / ITEMS_POR_PAGINA),
  )

  useEffect(() => {
    setPaginaActual(1)
  }, [query, filtroRubro, filtroSubrubro, ocultarSinStock])

  useEffect(() => {
    setFiltroSubrubro('')
  }, [filtroRubro])

  useEffect(() => {
    setPaginaActual((prev) => Math.min(Math.max(1, prev), totalPaginas))
  }, [totalPaginas])

  const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA
  const fin = inicio + ITEMS_POR_PAGINA
  const filasPagina = filasFiltradas.slice(inicio, fin)

  function toggleExpand(id: string) {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleRastrearLote(lote: string) {
    if (!lote.trim() || lote === 'Sin lote') return
    navigate(`/deposito/trazabilidad?lote=${encodeURIComponent(lote)}`)
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Inventario actual / Kardex
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Vista maestra del stock actual, lotes FEFO y valorización del
          inventario para catálogos grandes.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_auto] xl:items-end">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Buscar insumo o marca
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej. tomate, arcor, leche..."
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Filtro por rubro
              </span>
              <select
                value={filtroRubro}
                onChange={(e) => setFiltroRubro(e.target.value)}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              >
                <option value="">Todos los rubros</option>
                {rubrosDisponibles.map((rubro) => (
                  <option key={rubro} value={rubro}>
                    {rubro}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                Filtro por subrubro
              </span>
              <select
                value={filtroSubrubro}
                onChange={(e) => setFiltroSubrubro(e.target.value)}
                disabled={!filtroRubro}
                className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-[#8997A6]"
              >
                <option value="">Todos los subrubros</option>
                {subrubrosDisponibles.map((subrubro) => (
                  <option key={subrubro} value={subrubro}>
                    {subrubro}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#171717]">
              <input
                type="checkbox"
                checked={ocultarSinStock}
                onChange={(e) => setOcultarSinStock(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[#CD1818]"
              />
              Ocultar artículos sin stock
            </label>
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-gray-100 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Kardex valorizado
                </h2>
                <p className="mt-0.5 text-xs text-[#8997A6]">
                  Expandí cada fila para ver lotes positivos y aplicar criterio
                  FEFO.
                </p>
              </div>
              <p className="text-xs font-medium text-[#8997A6]">
                {filasFiltradas.length.toLocaleString('es-AR')} artículo
                {filasFiltradas.length === 1 ? '' : 's'} filtrado
                {filasFiltradas.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="w-14 px-4 py-3">Abrir</th>
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3">Unidad base</th>
                  <th className="px-4 py-3 text-right">Stock total</th>
                  <th className="px-4 py-3 text-right">Valorización</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filasPagina.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-[#8997A6]"
                    >
                      No hay artículos que coincidan con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filasPagina.map((fila) => {
                    const expanded = expandidos[fila.insumo.id] === true
                    const stockAgotado = fila.stockTotal <= 0

                    return (
                      <Fragment key={fila.insumo.id}>
                        <tr
                          onClick={() => toggleExpand(fila.insumo.id)}
                          className={`cursor-pointer transition hover:bg-gray-50 ${
                            stockAgotado ? 'bg-red-50/40' : 'bg-white'
                          }`}
                        >
                          <td className="px-4 py-3 align-middle">
                            <button
                              type="button"
                              aria-label={
                                expanded ? 'Contraer detalle' : 'Expandir detalle'
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(fila.insumo.id)
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#8997A6] transition hover:text-[#171717]"
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className={`h-4 w-4 transition-transform duration-300 ${
                                  expanded ? 'rotate-90' : ''
                                }`}
                                aria-hidden
                              >
                                <path d="m7 4 6 6-6 6" />
                              </svg>
                            </button>
                          </td>

                          <td className="px-4 py-3 align-middle">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#171717]">
                                {fila.insumo.nombreGenerico || 'Sin nombre'}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-[#8997A6]">
                                {fila.insumo.marca || 'Sin marca'}
                              </p>
                              <p className="mt-1 truncate text-xs text-[#8997A6]">
                                {fila.insumo.rubro || 'Sin rubro'}
                                {fila.insumo.subrubro
                                  ? ` / ${fila.insumo.subrubro}`
                                  : ''}
                              </p>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                            {fila.insumo.unidadBase}
                          </td>

                          <td
                            className={`px-4 py-3 text-right text-base font-bold tabular-nums ${
                              stockAgotado ? 'text-[#CD1818]' : 'text-[#171717]'
                            }`}
                          >
                            {formatCantidad(fila.stockTotal)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[#171717]">
                            {formatMoneda(fila.valorizacion)}
                          </td>
                        </tr>

                        <tr className="bg-white">
                          <td colSpan={5} className="p-0">
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-out ${
                                expanded ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
                              }`}
                            >
                              <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                                  <div className="border-b border-gray-100 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                                      Lotes con stock positivo
                                    </p>
                                  </div>

                                  {fila.lotes.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-[#8997A6]">
                                      Este insumo no tiene lotes positivos trazables
                                      para mostrar en detalle.
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                                        <thead>
                                          <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                                            <th className="px-4 py-3">Lote</th>
                                            <th className="px-4 py-3">
                                              Fecha de vencimiento
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                              Stock del lote
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {fila.lotes.map((lote) => {
                                            const estado = obtenerEstadoVencimiento(
                                              lote.fechaVencimiento,
                                            )
                                            return (
                                              <tr key={`${fila.insumo.id}-${lote.lote}`}>
                                                <td className="px-4 py-3 font-medium text-[#171717]">
                                                  <div className="flex items-center gap-2">
                                                    <span>{lote.lote}</span>
                                                    {lote.lote !== 'Sin lote' ? (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation()
                                                          handleRastrearLote(lote.lote)
                                                        }}
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#8997A6] transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
                                                        aria-label={`Rastrear lote ${lote.lote}`}
                                                        title="Rastrear lote"
                                                      >
                                                        <svg
                                                          viewBox="0 0 20 20"
                                                          fill="none"
                                                          stroke="currentColor"
                                                          strokeWidth="1.8"
                                                          className="h-3.5 w-3.5"
                                                          aria-hidden
                                                        >
                                                          <circle cx="8.5" cy="8.5" r="4.75" />
                                                          <path d="m12 12 4.25 4.25" />
                                                        </svg>
                                                      </button>
                                                    ) : null}
                                                  </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                  <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${estado.className}`}
                                                    title={estado.label}
                                                  >
                                                    {formatFechaVencimiento(
                                                      lote.fechaVencimiento,
                                                    )}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#171717]">
                                                  {formatCantidad(lote.stock)}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm">
            <p className="text-[#8997A6]">
              Mostrando{' '}
              <span className="font-semibold text-[#171717]">
                {filasFiltradas.length === 0 ? 0 : inicio + 1}-
                {Math.min(fin, filasFiltradas.length)}
              </span>{' '}
              de{' '}
              <span className="font-semibold text-[#171717]">
                {filasFiltradas.length}
              </span>
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
                disabled={paginaActual === 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
              >
                Anterior
              </button>
              <span className="min-w-[88px] text-center text-xs font-semibold text-[#171717]">
                Página {paginaActual} / {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPaginaActual((prev) => Math.min(totalPaginas, prev + 1))
                }
                disabled={paginaActual === totalPaginas}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
