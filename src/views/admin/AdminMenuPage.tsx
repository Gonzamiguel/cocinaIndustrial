import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Factory, UtensilsCrossed } from 'lucide-react'
import {
  deleteMenuItem,
  stockDisponibleParaPedidos,
  subscribeMenu,
  updateMenuNombre,
  updateMenuStock,
  type CategoriaMenu,
  type MenuItem,
} from '../../lib/menu'
import {
  formatFechaVencimiento,
  obtenerEstadoVencimiento,
} from '../../lib/vencimientoLote'
import { AdminProduccionCocinaTab } from './AdminProduccionCocinaTab'

const labelCategoria = (c: CategoriaMenu) =>
  c === 'principal' ? 'Plato principal' : 'Guarnición'

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function StockInventarioCelda({ item }: { item: MenuItem }) {
  const fisico = item.stock
  const comprometido = item.stockComprometido ?? 0
  const disponible = stockDisponibleParaPedidos(item)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-baseline gap-1 rounded-md bg-gray-50 px-2 py-1 text-xs tabular-nums ring-1 ring-gray-200"
        title="Unidades en cocina (lotes o stock manual)"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8997A6]">
          Fís.
        </span>
        <span className="font-semibold text-[#171717]">{fisico}</span>
      </span>
      {comprometido > 0 ? (
        <span
          className="inline-flex items-baseline gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs tabular-nums ring-1 ring-amber-200/80"
          title="Reservado por pedidos activos sin despachar"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80">
            Comp.
          </span>
          <span className="font-semibold text-amber-950">{comprometido}</span>
        </span>
      ) : null}
      <span
        className="inline-flex items-baseline gap-1 rounded-md bg-[#CD1818]/8 px-2 py-1 text-xs tabular-nums ring-1 ring-[#CD1818]/15"
        title="Lo que pueden pedir todavía (formulario público)"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#CD1818]/80">
          Disp.
        </span>
        <span className="font-bold text-[#CD1818]">{disponible}</span>
      </span>
    </div>
  )
}

export function AdminMenuPage() {
  const navigate = useNavigate()
  const itemsPorPagina = 8
  const [menuTab, setMenuTab] = useState<'stock' | 'produccion'>('stock')
  const [items, setItems] = useState<MenuItem[]>([])
  const [filtroActivo, setFiltroActivo] = useState<CategoriaMenu>('principal')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyStockId, setBusyStockId] = useState<string | null>(null)
  const [busyNombreId, setBusyNombreId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNombre, setDraftNombre] = useState('')
  const [draftAceptaGuarnicion, setDraftAceptaGuarnicion] = useState(true)
  const [draftStock, setDraftStock] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [paginaPorCategoria, setPaginaPorCategoria] = useState<
    Record<CategoriaMenu, number>
  >({
    principal: 1,
    guarnicion: 1,
  })
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    return subscribeMenu(setItems)
  }, [])

  const draftStockView = useMemo(() => {
    const next: Record<string, number> = {}
    for (const it of items) {
      const v = draftStock[it.id]
      next[it.id] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : it.stock
    }
    return next
  }, [draftStock, items])

  const itemsFiltrados = useMemo(
    () => items.filter((it) => it.categoria === filtroActivo),
    [items, filtroActivo],
  )

  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(itemsFiltrados.length / itemsPorPagina)),
    [itemsFiltrados.length],
  )

  const paginaActual = Math.min(
    Math.max(1, paginaPorCategoria[filtroActivo] ?? 1),
    totalPaginas,
  )

  const itemsPaginados = useMemo(() => {
    const start = (paginaActual - 1) * itemsPorPagina
    return itemsFiltrados.slice(start, start + itemsPorPagina)
  }, [itemsFiltrados, paginaActual])

  useEffect(() => {
    setPaginaPorCategoria((prev) => ({
      ...prev,
      [filtroActivo]: Math.min(Math.max(1, prev[filtroActivo] ?? 1), totalPaginas),
    }))
  }, [filtroActivo, totalPaginas])

  function setDraftStockValue(id: string, value: number) {
    const v = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    setDraftStock((prev) => ({ ...prev, [id]: v }))
  }

  async function saveStock(id: string) {
    const current = items.find((it) => it.id === id)
    if (!current) return
    const next = Math.max(0, draftStockView[id] ?? current.stock)
    if (next === current.stock) return
    if (!confirm('¿Deseas confirmar el nuevo stock?')) {
      setDraftStockValue(id, current.stock)
      return
    }
    setError(null)
    setBusyStockId(id)
    try {
      await updateMenuStock(id, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el stock')
      setDraftStockValue(id, current.stock)
    } finally {
      setBusyStockId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este plato del menú?')) return
    setError(null)
    setBusyId(id)
    try {
      await deleteMenuItem(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setBusyId(null)
    }
  }

  function startEditNombre(it: MenuItem) {
    setError(null)
    setEditingId(it.id)
    setDraftNombre(it.nombre)
    setDraftAceptaGuarnicion(it.aceptaGuarnicion)
  }

  function cancelEditNombre() {
    setEditingId(null)
    setDraftNombre('')
    setDraftAceptaGuarnicion(true)
  }

  async function saveEditNombre(id: string) {
    setError(null)
    setBusyNombreId(id)
    try {
      const it = items.find((x) => x.id === id)
      await updateMenuNombre(
        id,
        draftNombre,
        it?.categoria === 'principal' ? draftAceptaGuarnicion : undefined,
      )
      cancelEditNombre()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el nombre')
    } finally {
      setBusyNombreId(null)
    }
  }

  const inputFocusClass =
    'outline-none transition focus:border-[#CD1818]/30 focus:bg-white focus:ring-2 focus:ring-[#CD1818]/10'

  function toggleExpand(id: string) {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold tracking-tight text-[#CD1818] sm:text-xl">
          Gestión de menú
        </h1>
        <div className="mt-2 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
        <nav
          className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4"
          aria-label="Secciones menú"
        >
          <button
            type="button"
            onClick={() => setMenuTab('stock')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${
              menuTab === 'stock'
                ? 'bg-[#CD1818] text-white shadow-sm'
                : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" aria-hidden />
            Stock de platos
          </button>
          <button
            type="button"
            onClick={() => setMenuTab('produccion')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${
              menuTab === 'produccion'
                ? 'bg-[#CD1818] text-white shadow-sm'
                : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
            }`}
          >
            <Factory className="h-4 w-4 shrink-0" aria-hidden />
            Registrar producción
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
        {menuTab === 'stock' ? (
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-auto">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-sm text-[#CD1818]"
          >
            {error}
          </div>
        ) : null}

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="order-2 text-xs text-[#8997A6] sm:order-1">
              <span className="font-medium text-[#171717]">Fís.</span> en cocina ·{' '}
              <span className="font-medium text-[#171717]">Comp.</span> pedidos activos ·{' '}
              <span className="font-medium text-[#CD1818]">Disp.</span> para nuevos pedidos
            </p>
            <div
              className="order-1 inline-flex self-end rounded-lg border border-neutral-200 bg-white p-1 sm:order-2"
              role="tablist"
              aria-label="Filtrar por categoría"
            >
              <button
                type="button"
                role="tab"
                aria-selected={filtroActivo === 'principal'}
                onClick={() => setFiltroActivo('principal')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filtroActivo === 'principal'
                    ? 'bg-gray-50 text-[#CD1818] shadow-sm ring-1 ring-[#CD1818]/15'
                    : 'text-[#8997A6] hover:text-[#171717]'
                }`}
              >
                Platos principales
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filtroActivo === 'guarnicion'}
                onClick={() => setFiltroActivo('guarnicion')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filtroActivo === 'guarnicion'
                    ? 'bg-gray-50 text-[#CD1818] shadow-sm ring-1 ring-[#CD1818]/15'
                    : 'text-[#8997A6] hover:text-[#171717]'
                }`}
              >
                Guarniciones
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-sm text-[#8997A6] shadow-sm">
              No hay platos en el menú. Creá fichas en{' '}
              <Link
                to="/admin/recetario"
                className="font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
              >
                Recetario
              </Link>{' '}
              para publicarlos aquí.
            </p>
          ) : itemsFiltrados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-[#8997A6] shadow-sm">
              No hay ítems en «{labelCategoria(filtroActivo)}». Cambiá de pestaña o
              cargá recetas en esa categoría desde{' '}
              <Link
                to="/admin/recetario"
                className="font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
              >
                Recetario
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[min(100%,720px)] border-collapse text-left text-sm sm:min-w-[720px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[#8997A6]">
                      <th className="w-14 whitespace-nowrap px-3 py-3 pl-4 font-semibold sm:px-4">
                        Lotes
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                        Nombre
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                        Inventario
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                        Manual
                      </th>
                      <th className="w-px whitespace-nowrap px-3 py-3 pr-4 text-right font-semibold sm:px-4">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {itemsPaginados.map((it) => {
                      const busy = busyId === it.id
                      const nombreBusy = busyNombreId === it.id
                      const isEditing = editingId === it.id
                      const expanded = expandidos[it.id] === true
                      const lotes = it.stockLotes ?? []
                      const stockManual = lotes.length === 0
                      return (
                        <Fragment key={it.id}>
                        <tr
                          className={`transition-colors hover:bg-gray-50 ${expanded ? 'bg-gray-50/50' : ''}`}
                        >
                          <td className="px-3 py-2.5 pl-4 align-middle sm:px-4">
                            <button
                              type="button"
                              aria-label={expanded ? 'Ocultar lotes' : 'Ver lotes'}
                              onClick={() => toggleExpand(it.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#8997A6] transition hover:text-[#171717]"
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
                                aria-hidden
                              >
                                <path d="m7 4 6 6-6 6" />
                              </svg>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 align-middle sm:px-4">
                            {isEditing ? (
                              <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  value={draftNombre}
                                  onChange={(e) =>
                                    setDraftNombre(e.target.value)
                                  }
                                  className={`min-h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-[#171717] ${inputFocusClass}`}
                                  aria-label="Editar nombre del plato"
                                  disabled={nombreBusy}
                                />
                                {it.categoria === 'principal' ? (
                                  <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-[#171717]">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-[#CD1818]"
                                      checked={draftAceptaGuarnicion}
                                      onChange={(e) =>
                                        setDraftAceptaGuarnicion(e.target.checked)
                                      }
                                      disabled={nombreBusy}
                                    />
                                    ¿Acepta guarnición?
                                  </label>
                                ) : null}
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      nombreBusy ||
                                      draftNombre.trim().length === 0
                                    }
                                    onClick={() => saveEditNombre(it.id)}
                                    className="min-h-9 rounded-lg bg-[#CD1818] px-3 text-xs font-semibold text-white disabled:opacity-45"
                                  >
                                    {nombreBusy ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={nombreBusy}
                                    onClick={cancelEditNombre}
                                    className="min-h-9 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-[#171717] hover:bg-gray-50"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="min-w-0 flex-1 truncate font-medium text-[#171717]"
                                  title={it.nombre}
                                >
                                  {it.nombre}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy || nombreBusy}
                                  onClick={() => startEditNombre(it)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-[#8997A6] transition hover:border-[#CD1818]/30 hover:bg-gray-50 hover:text-[#CD1818] disabled:opacity-40"
                                  aria-label={`Editar nombre: ${it.nombre}`}
                                  title="Editar nombre"
                                >
                                  <PencilIcon />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-middle sm:px-4">
                            <StockInventarioCelda item={it} />
                            {lotes.length > 0 ? (
                              <p className="mt-1.5 text-[10px] text-[#8997A6]">
                                {lotes.length} lote{lotes.length === 1 ? '' : 's'} · expandir fila
                              </p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle sm:px-4">
                            {stockManual ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={draftStockView[it.id] ?? it.stock}
                                  disabled={busyStockId === it.id}
                                  onChange={(e) =>
                                    setDraftStockValue(
                                      it.id,
                                      Number.isNaN(e.target.valueAsNumber)
                                        ? Number(e.target.value) || 0
                                        : e.target.valueAsNumber,
                                    )
                                  }
                                  onBlur={() => void saveStock(it.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      void saveStock(it.id)
                                    }
                                  }}
                                  className="w-14 rounded-lg border border-gray-200 bg-white px-1.5 py-1.5 text-center text-sm font-semibold tabular-nums text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:opacity-50"
                                  aria-label={`Stock manual de ${it.nombre}`}
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  disabled={
                                    busyStockId === it.id ||
                                    (draftStockView[it.id] ?? it.stock) === it.stock
                                  }
                                  onClick={() => void saveStock(it.id)}
                                  title="Guardar stock"
                                  aria-label={`Guardar stock de ${it.nombre}`}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#CD1818] text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white disabled:shadow-none"
                                >
                                  {busyStockId === it.id ? (
                                    <span className="text-[10px] font-bold">…</span>
                                  ) : (
                                    <CheckIcon />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-[#8997A6] ring-1 ring-gray-200"
                                title="Este plato tiene lotes de producción. El stock físico se actualiza al registrar producción o al despachar."
                              >
                                <Factory className="h-3 w-3 shrink-0" aria-hidden />
                                Producción
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right align-middle sm:px-4">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(it.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8997A6] transition hover:bg-gray-50 hover:text-[#CD1818] disabled:opacity-40"
                              title="Eliminar plato"
                              aria-label={`Eliminar ${it.nombre}`}
                            >
                              <TrashIcon className="shrink-0 opacity-80" />
                            </button>
                          </td>
                        </tr>
                        <tr className="bg-white">
                          <td colSpan={5} className="p-0">
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-out ${
                                expanded ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'
                              }`}
                            >
                              <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-4 sm:px-5">
                                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                                  <div className="border-b border-gray-100 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                                      Lotes en stock — {it.nombre}
                                    </p>
                                  </div>
                                  {lotes.length === 0 ? (
                                    <p className="px-4 py-6 text-sm text-[#8997A6]">
                                      Sin lotes trazables. El stock manual no tiene lote/vencimiento;
                                      registrá producción para trazabilidad.
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                                        <thead>
                                          <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                                            <th className="px-4 py-3">Lote producción</th>
                                            <th className="px-4 py-3">Vencimiento</th>
                                            <th className="px-4 py-3 text-right">Cantidad</th>
                                            <th className="px-4 py-3 text-right">Trazabilidad</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {lotes.map((loteRow) => {
                                            const estado = obtenerEstadoVencimiento(
                                              loteRow.fechaVencimiento,
                                            )
                                            return (
                                              <tr
                                                key={`${loteRow.lote}-${loteRow.fechaVencimiento}-${loteRow.produccionId}`}
                                              >
                                                <td className="px-4 py-3 font-mono text-xs font-medium text-[#171717]">
                                                  {loteRow.lote}
                                                </td>
                                                <td className="px-4 py-3">
                                                  <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${estado.className}`}
                                                  >
                                                    {formatFechaVencimiento(loteRow.fechaVencimiento)}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                  {loteRow.cantidad}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                  {loteRow.produccionId ? (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        navigate(
                                                          `/admin/trazabilidad?produccionId=${encodeURIComponent(loteRow.produccionId)}`,
                                                        )
                                                      }
                                                      className="inline-flex items-center gap-1 rounded-lg border border-[#CD1818]/25 px-2.5 py-1 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/5"
                                                    >
                                                      Ver flujo completo
                                                    </button>
                                                  ) : (
                                                    '—'
                                                  )}
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
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#171717]">
                <span className="font-medium">
                  Página {paginaActual} de {totalPaginas}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPaginaPorCategoria((prev) => ({
                        ...prev,
                        [filtroActivo]: Math.max(1, paginaActual - 1),
                      }))
                    }
                    disabled={paginaActual === 1}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] focus:outline-none focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-[#8997A6]"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaginaPorCategoria((prev) => ({
                        ...prev,
                        [filtroActivo]: Math.min(totalPaginas, paginaActual + 1),
                      }))
                    }
                    disabled={paginaActual === totalPaginas}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] focus:outline-none focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-[#8997A6]"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col pb-4">
            <AdminProduccionCocinaTab
              className="flex min-h-0 flex-1 flex-col"
              onAfterSuccess={() => setMenuTab('stock')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
