import { Fragment, useEffect, useMemo, useState } from 'react'
import { Database } from 'lucide-react'
import { Link } from 'react-router-dom'
import { subscribeCategorias, type Categoria } from '../../lib/categorias'
import {
  subscribeMovimientosInventarioPorUbicacion,
  opcionesHistorialAmplio,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import { exportarInventarioStockExcel } from '../../lib/inventarioExcelExport'
import { InsumoCeldaStock } from './InsumoCeldaStock'

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

export type InventarioUbicacionPanelProps = {
  ubicacionId: string
  /** Página completa (campamento) o incrustado en pestaña (cocina). */
  layout: 'page' | 'embedded'
  /** Prefijo del archivo Excel (sin extensión). */
  exportBasename: string
  recepcionLink?: { to: string; label: string; state?: unknown } | null
}

export function InventarioUbicacionPanel({
  ubicacionId,
  layout,
  exportBasename,
  recepcionLink,
}: InventarioUbicacionPanelProps) {
  const ub = ubicacionId.trim().toUpperCase()
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
    if (!ub) {
      setMovimientos([])
      return
    }
    return subscribeMovimientosInventarioPorUbicacion(
      ub,
      setMovimientos,
      opcionesHistorialAmplio(35000),
    )
  }, [ub])

  useEffect(() => {
    return subscribeCategorias(setCategorias)
  }, [])

  const filas = useMemo(() => {
    const lotesPorInsumo = new Map<string, Map<string, LoteResumen>>()
    const stockPorInsumo = new Map<string, number>()

    for (const mov of movimientos) {
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
      const presentacion = normalizarTexto(insumo.presentacion)
      return nombre.includes(q) || marca.includes(q) || presentacion.includes(q)
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

  function exportarInventarioLocalExcel() {
    exportarInventarioStockExcel({
      filas: filasFiltradas,
      ubicacionId: ub,
      basename: exportBasename,
    })
  }

  if (!ub) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-10 text-center text-sm text-neutral-600">
        <p>
          Ubicación inválida. Configurá{' '}
          <code className="rounded bg-neutral-100 px-1 text-xs">ubicacionId</code> en tu usuario.
        </p>
      </div>
    )
  }

  const filtros = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_auto] xl:items-end">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
          Buscar insumo o marca
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej. tomate, arcor, leche..."
          className="mt-2 w-full min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
          Filtro por rubro
        </span>
        <select
          value={filtroRubro}
          onChange={(e) => setFiltroRubro(e.target.value)}
          className="mt-2 w-full min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
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
          className="mt-2 w-full min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-[#8997A6]"
        >
          <option value="">Todos los subrubros</option>
          {subrubrosDisponibles.map((subrubro) => (
            <option key={subrubro} value={subrubro}>
              {subrubro}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-[#171717]">
        <input
          type="checkbox"
          checked={ocultarSinStock}
          onChange={(e) => setOcultarSinStock(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 accent-[#CD1818]"
        />
        Ocultar sin stock
      </label>
    </div>
  )

  const acciones = (
    <div className="flex flex-wrap items-center gap-2">
      {recepcionLink ? (
        <Link
          to={recepcionLink.to}
          state={recepcionLink.state}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-neutral-50"
        >
          {recepcionLink.label}
        </Link>
      ) : null}
      <button
        type="button"
        onClick={exportarInventarioLocalExcel}
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#CD1818] px-4 text-sm font-semibold text-white transition hover:brightness-110"
      >
        Exportar Excel
      </button>
    </div>
  )

  const tablaKardex = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 sm:px-4">
        <p className="text-xs text-[#8997A6]">
          <span className="font-mono text-[11px] text-[#171717]">{ub}</span>
          {' · '}
          {filasFiltradas.length.toLocaleString('es-AR')} resultado
          {filasFiltradas.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 shadow-sm">
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-[#8997A6]">
              <th className="w-14 px-4 py-3">Abrir</th>
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3 text-right">Stock total</th>
              <th className="px-4 py-3">Unidad base</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {filasPagina.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center text-[#8997A6]">
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
                      className={`cursor-pointer transition hover:bg-neutral-50/80 ${
                        stockAgotado ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          aria-label={expanded ? 'Contraer detalle' : 'Expandir detalle'}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(fila.insumo.id)
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#8997A6] transition hover:text-[#171717]"
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
                        <InsumoCeldaStock insumo={fila.insumo} />
                      </td>

                      <td
                        className={`px-4 py-3 text-right text-base font-bold tabular-nums ${
                          stockAgotado ? 'text-[#CD1818]' : 'text-[#171717]'
                        }`}
                      >
                        {formatCantidad(fila.stockTotal)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                        {fila.insumo.unidadBase}
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={4} className="p-0">
                        <div
                          className={`overflow-hidden transition-all duration-300 ease-out ${
                            expanded ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
                          }`}
                        >
                          <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                            <div className="border border-neutral-200 bg-white">
                              <div className="border-b border-neutral-100 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8997A6]">
                                  Lotes (FEFO)
                                </p>
                              </div>

                              {fila.lotes.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-[#8997A6]">
                                  Sin lotes positivos trazables para este insumo.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                                    <thead>
                                      <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-[#8997A6]">
                                        <th className="px-3 py-2">Lote</th>
                                        <th className="px-3 py-2">Vencimiento</th>
                                        <th className="px-3 py-2 text-right">Stock</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {fila.lotes.map((lote) => {
                                        const estado = obtenerEstadoVencimiento(lote.fechaVencimiento)
                                        return (
                                          <tr key={`${fila.insumo.id}-${lote.lote}`}>
                                            <td className="px-3 py-2 font-medium text-[#171717]">{lote.lote}</td>
                                            <td className="px-3 py-2">
                                              <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.className}`}
                                                title={estado.label}
                                              >
                                                {formatFechaVencimiento(lote.fechaVencimiento)}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#171717]">
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-sm">
        <p className="text-xs text-[#8997A6]">
          Mostrando{' '}
          <span className="font-semibold text-[#171717]">
            {filasFiltradas.length === 0 ? 0 : inicio + 1}-{Math.min(fin, filasFiltradas.length)}
          </span>{' '}
          de <span className="font-semibold text-[#171717]">{filasFiltradas.length}</span>
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
            disabled={paginaActual === 1}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
          >
            Anterior
          </button>
          <span className="min-w-[88px] text-center text-xs font-semibold text-[#171717]">
            {paginaActual} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPaginaActual((prev) => Math.min(totalPaginas, prev + 1))}
            disabled={paginaActual === totalPaginas}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )

  if (layout === 'embedded') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">{filtros}</div>
          <div className="shrink-0">{acciones}</div>
        </div>
        <div className="min-h-0 flex-1">{tablaKardex}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-6 w-6 shrink-0 text-[#CD1818]" aria-hidden />
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Inventario local
              </h1>
            </div>
            <p className="mt-1 text-sm text-[#8997A6]">
              Movimientos con{' '}
              <span className="font-mono text-xs text-[#171717]">ubicacionId = {ub}</span>.
            </p>
          </div>
          {acciones}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {filtros}
        {tablaKardex}
      </div>
    </div>
  )
}
