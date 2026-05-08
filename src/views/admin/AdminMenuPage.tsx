import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addMenuItem,
  deleteMenuItem,
  subscribeMenu,
  updateMenuNombre,
  updateMenuStock,
  type CategoriaMenu,
  type MenuItem,
} from '../../lib/menu'

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

export function AdminMenuPage() {
  const itemsPorPagina = 5
  const [items, setItems] = useState<MenuItem[]>([])
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<CategoriaMenu>('principal')
  const [stock, setStock] = useState(0)
  const [aceptaGuarnicionNuevo, setAceptaGuarnicionNuevo] = useState(true)
  const [filtroActivo, setFiltroActivo] = useState<CategoriaMenu>('principal')
  const [loading, setLoading] = useState(false)
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await addMenuItem({
        nombre,
        categoria,
        stock: Number(stock),
        aceptaGuarnicion: categoria === 'principal' ? aceptaGuarnicionNuevo : undefined,
      })
      setNombre('')
      setStock(0)
      setAceptaGuarnicionNuevo(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el plato')
    } finally {
      setLoading(false)
    }
  }

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

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Gestión de menú
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Alta de platos y control de stock para la vista cliente.
        </p>
        <div className="mt-3 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-8 overflow-auto p-4 sm:p-6 lg:p-8">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-sm text-[#CD1818]"
          >
            {error}
          </div>
        ) : null}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
            Nuevo plato
          </h2>
          <form className="mt-5 space-y-4" onSubmit={handleAdd}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(7rem,0.6fr)] lg:items-end">
              <label className="block">
                <span className="text-xs font-medium text-[#8997A6]">Nombre</span>
                <input
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className={`mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] ${inputFocusClass}`}
                  placeholder="Ej. Milanesa napolitana"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#8997A6]">Categoría</span>
                <select
                  required
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CategoriaMenu)}
                  className={`mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] ${inputFocusClass}`}
                >
                  <option value="principal">Plato principal</option>
                  <option value="guarnicion">Guarnición</option>
                </select>
              </label>
              {categoria === 'principal' ? (
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-[#171717]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#CD1818]"
                    checked={aceptaGuarnicionNuevo}
                    onChange={(e) => setAceptaGuarnicionNuevo(e.target.checked)}
                  />
                  ¿Acepta guarnición?
                </label>
              ) : (
                <div className="hidden lg:block" aria-hidden />
              )}
              <label className="block">
                <span className="text-xs font-medium text-[#8997A6]">
                  Stock inicial
                </span>
                <input
                  required
                  type="number"
                  min={0}
                  step={1}
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
                  className={`mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] ${inputFocusClass}`}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="min-h-11 w-full rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95 disabled:opacity-50 sm:w-auto"
              >
                {loading ? 'Guardando…' : 'Agregar plato'}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Platos en menú
            </h2>
            <div
              className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
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
              No hay platos. Creá el primero con el formulario superior.
            </p>
          ) : itemsFiltrados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-[#8997A6] shadow-sm">
              No hay ítems en «{labelCategoria(filtroActivo)}». Cambiá de pestaña o
              agregá platos en esa categoría.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[min(100%,520px)] border-collapse text-left text-sm sm:min-w-[520px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[#8997A6]">
                      <th className="whitespace-nowrap px-3 py-3 pl-4 font-semibold sm:px-4">
                        Nombre
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                        Estado
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                        Stock
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
                      const disponible = it.stock > 0
                      const isEditing = editingId === it.id
                      return (
                        <tr
                          key={it.id}
                          className="transition-colors hover:bg-gray-50"
                        >
                          <td className="px-3 py-2.5 pl-4 align-middle sm:px-4">
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
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle sm:px-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                                disponible
                                  ? 'bg-gray-100 text-[#171717] ring-gray-200'
                                  : 'bg-gray-100 text-[#8997A6] ring-gray-200'
                              }`}
                            >
                              {disponible ? 'Disponible' : 'Agotado'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle sm:px-4">
                            <div className="flex items-center gap-2">
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
                                className="min-w-[4.5rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:opacity-50"
                                aria-label={`Stock de ${it.nombre}`}
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                disabled={
                                  busyStockId === it.id ||
                                  (draftStockView[it.id] ?? it.stock) === it.stock
                                }
                                onClick={() => void saveStock(it.id)}
                                className="flex items-center gap-1 rounded-lg bg-[#CD1818] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white disabled:shadow-none"
                              >
                                {busyStockId === it.id ? 'Guardando…' : 'Guardar'}
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right align-middle sm:px-4">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(it.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#8997A6] transition hover:bg-gray-50 hover:text-[#CD1818] disabled:opacity-40"
                              title="Eliminar plato"
                            >
                              <TrashIcon className="shrink-0 opacity-80" />
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          </td>
                        </tr>
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
        </section>
      </div>
    </div>
  )
}
