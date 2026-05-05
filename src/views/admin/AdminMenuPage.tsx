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
  const [items, setItems] = useState<MenuItem[]>([])
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<CategoriaMenu>('principal')
  const [stock, setStock] = useState(0)
  const [filtroActivo, setFiltroActivo] = useState<CategoriaMenu>('principal')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyNombreId, setBusyNombreId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNombre, setDraftNombre] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return subscribeMenu(setItems)
  }, [])

  const itemsFiltrados = useMemo(
    () => items.filter((it) => it.categoria === filtroActivo),
    [items, filtroActivo],
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await addMenuItem({ nombre, categoria, stock: Number(stock) })
      setNombre('')
      setStock(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el plato')
    } finally {
      setLoading(false)
    }
  }

  async function adjustStock(id: string, delta: number, current: number) {
    const next = Math.max(0, current + delta)
    setError(null)
    setBusyId(id)
    try {
      await updateMenuStock(id, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el stock')
    } finally {
      setBusyId(null)
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
  }

  function cancelEditNombre() {
    setEditingId(null)
    setDraftNombre('')
  }

  async function saveEditNombre(id: string) {
    setError(null)
    setBusyNombreId(id)
    try {
      await updateMenuNombre(id, draftNombre)
      cancelEditNombre()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el nombre')
    } finally {
      setBusyNombreId(null)
    }
  }

  const inputFocusClass =
    'outline-none transition focus:border-brand-accent focus:bg-brand-surface focus:ring-2 focus:ring-brand-accent/20'

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-brand-muted/15 bg-brand-muted/5 px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-brand-accent">
          Gestión de menú
        </h1>
        <p className="mt-1 text-sm text-brand-muted">
          Alta de platos y control de stock para la vista cliente.
        </p>
        <div className="mt-3 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-brand-accent underline-offset-2 hover:text-brand-muted hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-8 overflow-auto p-4 sm:p-6 lg:p-8">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-brand-accent/35 bg-brand-accent/5 px-4 py-3 text-sm text-brand-accent"
          >
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-brand-muted/15 bg-brand-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-accent">
            Nuevo plato
          </h2>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
            onSubmit={handleAdd}
          >
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-brand-muted">Nombre</span>
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={`mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-sm text-brand-accent ${inputFocusClass}`}
                placeholder="Ej. Milanesa napolitana"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">Categoría</span>
              <select
                required
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaMenu)}
                className={`mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-sm text-brand-accent ${inputFocusClass}`}
              >
                <option value="principal">Plato principal</option>
                <option value="guarnicion">Guarnición</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-brand-muted">
                Stock inicial
              </span>
              <input
                required
                type="number"
                min={0}
                step={1}
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                className={`mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-sm text-brand-accent ${inputFocusClass}`}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-1 lg:col-start-4">
              <button
                type="submit"
                disabled={loading}
                className="min-h-11 w-full rounded-xl bg-brand-accent text-sm font-semibold text-white shadow-md shadow-brand-accent/25 transition hover:brightness-105 active:brightness-95 disabled:opacity-50"
              >
                {loading ? 'Guardando…' : 'Agregar plato'}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-accent">
              Platos en menú
            </h2>
            <div
              className="inline-flex rounded-xl border border-brand-muted/15 bg-brand-muted/10 p-1 shadow-inner"
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
                    ? 'bg-brand-surface text-brand-accent shadow-sm ring-2 ring-brand-accent/35'
                    : 'text-brand-muted hover:text-brand-accent'
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
                    ? 'bg-brand-surface text-brand-accent shadow-sm ring-2 ring-brand-accent/35'
                    : 'text-brand-muted hover:text-brand-accent'
                }`}
              >
                Guarniciones
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-muted/25 bg-brand-surface px-6 py-14 text-center text-sm text-brand-muted">
              No hay platos. Creá el primero con el formulario superior.
            </p>
          ) : itemsFiltrados.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-muted/25 bg-brand-surface px-6 py-10 text-center text-sm text-brand-muted">
              No hay ítems en «{labelCategoria(filtroActivo)}». Cambiá de pestaña o
              agregá platos en esa categoría.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-brand-muted/15 bg-brand-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[min(100%,520px)] border-collapse text-left text-sm sm:min-w-[520px]">
                  <thead>
                    <tr className="border-b border-white/20 bg-brand-accent text-white">
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
                  <tbody className="divide-y divide-brand-muted/12">
                    {itemsFiltrados.map((it) => {
                      const busy = busyId === it.id
                      const nombreBusy = busyNombreId === it.id
                      const disponible = it.stock > 0
                      const isEditing = editingId === it.id
                      return (
                        <tr
                          key={it.id}
                          className="transition-colors hover:bg-brand-muted/5"
                        >
                          <td className="px-3 py-2.5 pl-4 align-middle sm:px-4">
                            {isEditing ? (
                              <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  value={draftNombre}
                                  onChange={(e) =>
                                    setDraftNombre(e.target.value)
                                  }
                                  className={`min-h-10 min-w-0 flex-1 rounded-lg border border-brand-muted/25 px-2.5 text-sm font-medium text-brand-accent ${inputFocusClass}`}
                                  aria-label="Editar nombre del plato"
                                  disabled={nombreBusy}
                                />
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      nombreBusy ||
                                      draftNombre.trim().length === 0
                                    }
                                    onClick={() => saveEditNombre(it.id)}
                                    className="min-h-9 rounded-lg bg-brand-accent px-3 text-xs font-semibold text-white disabled:opacity-45"
                                  >
                                    {nombreBusy ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={nombreBusy}
                                    onClick={cancelEditNombre}
                                    className="min-h-9 rounded-lg border border-brand-muted/30 px-3 text-xs font-semibold text-brand-accent hover:bg-brand-muted/8"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="min-w-0 flex-1 truncate font-medium text-brand-accent"
                                  title={it.nombre}
                                >
                                  {it.nombre}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy || nombreBusy}
                                  onClick={() => startEditNombre(it)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-muted/25 text-brand-accent transition hover:border-brand-accent/40 hover:bg-brand-accent/8 disabled:opacity-40"
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
                                  ? 'bg-brand-muted/8 text-brand-accent ring-brand-muted/25'
                                  : 'bg-brand-muted/12 text-brand-muted ring-brand-muted/20'
                              }`}
                            >
                              {disponible ? 'Disponible' : 'Agotado'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-middle sm:px-4">
                            <div className="inline-flex items-center gap-0.5 rounded-lg border border-brand-muted/20 bg-brand-muted/5 p-0.5">
                              <button
                                type="button"
                                disabled={busy || it.stock <= 0}
                                onClick={() => adjustStock(it.id, -1, it.stock)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base font-semibold text-brand-accent transition hover:bg-brand-surface disabled:opacity-35"
                                aria-label="Restar una unidad"
                              >
                                −
                              </button>
                              <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-brand-accent">
                                {it.stock}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => adjustStock(it.id, 1, it.stock)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base font-semibold text-brand-accent transition hover:bg-brand-surface disabled:opacity-35"
                                aria-label="Sumar una unidad"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right align-middle sm:px-4">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(it.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-muted transition hover:bg-brand-accent/8 hover:text-brand-accent disabled:opacity-40"
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
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
