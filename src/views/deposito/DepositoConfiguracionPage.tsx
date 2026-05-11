import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import {
  actualizarCategoria,
  crearCategoria,
  eliminarCategoria,
  existeInsumoUsandoRubro,
  existeInsumoUsandoSubrubro,
  subscribeCategorias,
  type Categoria,
} from '../../lib/categorias'

const inputClass =
  'mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

export function DepositoConfiguracionPage() {
  const { showToast } = useToast()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nuevoRubro, setNuevoRubro] = useState('')
  const [nuevoSubrubro, setNuevoSubrubro] = useState('')
  const [guardandoRubro, setGuardandoRubro] = useState(false)
  const [guardandoSubrubro, setGuardandoSubrubro] = useState(false)

  useEffect(() => {
    return subscribeCategorias((rows) => {
      setCategorias(rows)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedId && categorias.length > 0) {
      setSelectedId(categorias[0].id)
      return
    }
    if (selectedId && !categorias.some((item) => item.id === selectedId)) {
      setSelectedId(categorias[0]?.id ?? null)
    }
  }, [categorias, selectedId])

  const categoriaActiva = useMemo(
    () => categorias.find((item) => item.id === selectedId) ?? null,
    [categorias, selectedId],
  )

  async function handleCrearRubro(e: React.FormEvent) {
    e.preventDefault()
    setGuardandoRubro(true)
    try {
      const id = await crearCategoria({ nombre: nuevoRubro, subrubros: [] })
      setNuevoRubro('')
      setSelectedId(id)
      showToast('Rubro creado.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo crear el rubro.',
        'error',
      )
    } finally {
      setGuardandoRubro(false)
    }
  }

  async function handleAgregarSubrubro(e: React.FormEvent) {
    e.preventDefault()
    if (!categoriaActiva) return
    setGuardandoSubrubro(true)
    try {
      await actualizarCategoria(categoriaActiva.id, {
        nombre: categoriaActiva.nombre,
        subrubros: [...categoriaActiva.subrubros, nuevoSubrubro],
      })
      setNuevoSubrubro('')
      showToast('Subrubro agregado.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo agregar el subrubro.',
        'error',
      )
    } finally {
      setGuardandoSubrubro(false)
    }
  }

  async function handleEliminarSubrubro(nombre: string) {
    if (!categoriaActiva) return
    try {
      const enUso = await existeInsumoUsandoSubrubro(
        categoriaActiva.nombre,
        nombre,
      )
      if (enUso) {
        showToast(
          'No se puede eliminar este subrubro porque hay insumos que lo están utilizando. Reasigne los insumos primero.',
          'error',
        )
        return
      }

      await actualizarCategoria(categoriaActiva.id, {
        nombre: categoriaActiva.nombre,
        subrubros: categoriaActiva.subrubros.filter((item) => item !== nombre),
      })
      showToast('Subrubro eliminado.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo eliminar el subrubro.',
        'error',
      )
    }
  }

  async function handleEliminarRubro() {
    if (!categoriaActiva) return
    if (!confirm(`¿Eliminar el rubro «${categoriaActiva.nombre}»?`)) return
    try {
      const enUso = await existeInsumoUsandoRubro(categoriaActiva.nombre)
      if (enUso) {
        showToast(
          'No se puede eliminar este rubro porque hay insumos que lo están utilizando. Reasigne los insumos primero.',
          'error',
        )
        return
      }

      await eliminarCategoria(categoriaActiva.id)
      showToast('Rubro eliminado.')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo eliminar el rubro.',
        'error',
      )
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Configuración de categorías
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Administrá rubros y subrubros dinámicos para el catálogo de insumos.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Nuevo rubro
            </h2>
            <form onSubmit={handleCrearRubro} className="mt-5">
              <label className="block">
                <span className="text-xs font-medium text-[#8997A6]">
                  Nombre del rubro
                </span>
                <input
                  value={nuevoRubro}
                  onChange={(e) => setNuevoRubro(e.target.value)}
                  className={inputClass}
                  placeholder="Ej. Alimentos"
                />
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={guardandoRubro}
                  className="inline-flex min-h-11 items-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
                >
                  {guardandoRubro ? 'Guardando…' : 'Agregar rubro'}
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                Rubros existentes
              </p>
              {cargando ? (
                <p className="mt-3 text-sm text-[#8997A6]">Cargando categorías…</p>
              ) : categorias.length === 0 ? (
                <p className="mt-3 text-sm text-[#8997A6]">
                  Todavía no hay rubros cargados.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {categorias.map((categoria) => {
                    const active = categoria.id === selectedId
                    return (
                      <button
                        key={categoria.id}
                        type="button"
                        onClick={() => setSelectedId(categoria.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          active
                            ? 'border-[#CD1818]/20 bg-red-50/40'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-[#171717]">
                          {categoria.nombre}
                        </span>
                        <span className="text-xs text-[#8997A6]">
                          {categoria.subrubros.length} subrubro
                          {categoria.subrubros.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Subrubros
                </h2>
                <p className="mt-1 text-sm text-[#8997A6]">
                  Seleccioná un rubro para administrar sus subcategorías.
                </p>
              </div>
              {categoriaActiva ? (
                <button
                  type="button"
                  onClick={() => void handleEliminarRubro()}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[#8997A6] transition hover:bg-red-50 hover:text-[#CD1818]"
                >
                  Eliminar rubro
                </button>
              ) : null}
            </div>

            {!categoriaActiva ? (
              <div className="py-10 text-sm text-[#8997A6]">
                Elegí un rubro de la lista para continuar.
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                    Rubro activo
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#171717]">
                    {categoriaActiva.nombre}
                  </p>
                </div>

                <form onSubmit={handleAgregarSubrubro} className="mt-5">
                  <label className="block">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Nuevo subrubro
                    </span>
                    <input
                      value={nuevoSubrubro}
                      onChange={(e) => setNuevoSubrubro(e.target.value)}
                      className={inputClass}
                      placeholder="Ej. Lácteos"
                    />
                  </label>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={guardandoSubrubro}
                      className="inline-flex min-h-11 items-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
                    >
                      {guardandoSubrubro ? 'Guardando…' : 'Agregar subrubro'}
                    </button>
                  </div>
                </form>

                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                    Subrubros del rubro
                  </p>
                  {categoriaActiva.subrubros.length === 0 ? (
                    <p className="mt-3 text-sm text-[#8997A6]">
                      Este rubro todavía no tiene subrubros.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categoriaActiva.subrubros.map((subrubro) => (
                        <span
                          key={subrubro}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-[#171717] shadow-sm"
                        >
                          {subrubro}
                          <button
                            type="button"
                            onClick={() => void handleEliminarSubrubro(subrubro)}
                            className="rounded-full p-1 text-[#8997A6] transition hover:bg-red-50 hover:text-[#CD1818]"
                            aria-label={`Eliminar ${subrubro}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-4 w-4"
                            >
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
