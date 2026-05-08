import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import {
  CATEGORIAS_RECETA,
  DIETAS_RECETA,
  UNIDADES_RECETA,
  crearReceta,
  subscribeRecetario,
  type CategoriaReceta,
  type DietaReceta,
  type RecetaTecnica,
  type UnidadReceta,
} from '../../lib/recetario'

type FilaIngredienteDraft = {
  key: string
  ingrediente: string
  cantidadBruta: string
  unidad: UnidadReceta | ''
  porcentajeMerma: string
  costoEstimado: string
}

const inputBaseClass =
  'mt-2.5 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

const textAreaClass =
  'mt-2.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

function nuevaFilaIngrediente(): FilaIngredienteDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    ingrediente: '',
    cantidadBruta: '',
    unidad: '',
    porcentajeMerma: '',
    costoEstimado: '',
  }
}

function formatFecha(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminRecetarioPage() {
  const { showToast } = useToast()
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [cargando, setCargando] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [detalleModalId, setDetalleModalId] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<CategoriaReceta>('Principal')
  const [aceptaGuarnicion, setAceptaGuarnicion] = useState(true)
  const [dietas, setDietas] = useState<DietaReceta[]>([])
  const [rendimientoPorciones, setRendimientoPorciones] = useState('')
  const [procedimiento, setProcedimiento] = useState('')
  const [filasIngredientes, setFilasIngredientes] = useState<FilaIngredienteDraft[]>([
    nuevaFilaIngrediente(),
  ])

  useEffect(() => {
    return subscribeRecetario((rows) => {
      setRecetas(rows)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    if (categoria === 'Guarnición') {
      setAceptaGuarnicion(false)
    }
  }, [categoria])

  useEffect(() => {
    if (!detalleModalId) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDetalleModalId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detalleModalId])

  const recetaEnDetalle = useMemo(() => {
    if (!detalleModalId) return null
    return recetas.find((item) => item.id === detalleModalId) ?? null
  }, [detalleModalId, recetas])

  function resetFormulario() {
    setNombre('')
    setCategoria('Principal')
    setAceptaGuarnicion(true)
    setDietas([])
    setRendimientoPorciones('')
    setProcedimiento('')
    setFilasIngredientes([nuevaFilaIngrediente()])
  }

  function actualizarFila(index: number, parcial: Partial<FilaIngredienteDraft>) {
    setFilasIngredientes((prev) =>
      prev.map((fila, current) =>
        current === index ? { ...fila, ...parcial } : fila,
      ),
    )
  }

  function agregarFila() {
    setFilasIngredientes((prev) => [...prev, nuevaFilaIngrediente()])
  }

  function quitarFila(index: number) {
    setFilasIngredientes((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, current) => current !== index),
    )
  }

  function toggleDieta(dieta: DietaReceta) {
    setDietas((prev) =>
      prev.includes(dieta)
        ? prev.filter((item) => item !== dieta)
        : [...prev, dieta],
    )
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)

    try {
      await crearReceta({
        nombre,
        categoria,
        aceptaGuarnicion,
        dietas,
        rendimientoPorciones: Number(rendimientoPorciones),
        procedimiento,
        ingredientes: filasIngredientes.map((fila) => ({
          ingrediente: fila.ingrediente,
          cantidadBruta: Number(fila.cantidadBruta),
          unidad: (fila.unidad || 'Un') as UnidadReceta,
          porcentajeMerma: Number(fila.porcentajeMerma || 0),
          costoEstimado: Number(fila.costoEstimado || 0),
        })),
      })
      showToast('Receta guardada correctamente.')
      resetFormulario()
      setIsCreating(false)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo guardar la receta.',
        'error',
      )
    } finally {
      setGuardando(false)
    }
  }

  if (!isCreating) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-gray-50">
        <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8997A6]">
                Fichas técnicas
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#CD1818]">
                Recetario
              </h1>
              <p className="mt-2 text-sm text-[#8997A6]">
                Biblioteca documental de recetas para cocina, separada de la
                gestión de stock.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <span className="text-xl leading-none">+</span>
              Nueva receta
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Recetas registradas
              </h2>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                Consultá las fichas técnicas y abrí el detalle completo en modo
                lectura.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Rendimiento</th>
                    <th className="px-4 py-3">Actualización</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {cargando ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        Cargando recetario...
                      </td>
                    </tr>
                  ) : recetas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        Todavía no hay recetas registradas. Creá una con
                        «Nueva receta».
                      </td>
                    </tr>
                  ) : (
                    recetas.map((receta) => (
                      <tr key={receta.id} className="hover:bg-neutral-50/80">
                        <td className="px-4 py-3 font-medium text-[#171717]">
                          {receta.nombre}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {receta.categoria}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {receta.rendimientoPorciones} porciones
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                          {formatFecha(receta.ultimaActualizacion)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetalleModalId(receta.id)}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-50"
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
          </div>
        </div>

        {recetaEnDetalle ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setDetalleModalId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-detalle-receta-titulo"
              className="flex max-h-[min(90vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8997A6]">
                    Ficha técnica
                  </p>
                  <h2
                    id="modal-detalle-receta-titulo"
                    className="mt-1 text-lg font-semibold text-[#CD1818]"
                  >
                    {recetaEnDetalle.nombre}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
                  aria-label="Cerrar"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                      Categoría
                    </p>
                    <p className="mt-1 font-semibold text-[#171717]">
                      {recetaEnDetalle.categoria}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                      Rendimiento
                    </p>
                    <p className="mt-1 font-semibold text-[#171717]">
                      {recetaEnDetalle.rendimientoPorciones} porciones
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                      Acepta guarnición
                    </p>
                    <p className="mt-1 font-semibold text-[#171717]">
                      {recetaEnDetalle.aceptaGuarnicion ? 'Sí' : 'No'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                      Última actualización
                    </p>
                    <p className="mt-1 font-semibold text-[#171717]">
                      {formatFecha(recetaEnDetalle.ultimaActualizacion)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                    Dietas
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recetaEnDetalle.dietas.length > 0 ? (
                      recetaEnDetalle.dietas.map((dieta) => (
                        <span
                          key={dieta}
                          className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-[#171717] ring-1 ring-gray-200"
                        >
                          {dieta}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-[#8997A6]">
                        Sin dietas asociadas.
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                    Ingredientes
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
                          <th className="px-3 py-2 font-semibold">Ingrediente</th>
                          <th className="px-3 py-2 font-semibold">Cantidad</th>
                          <th className="px-3 py-2 font-semibold">Unidad</th>
                          <th className="px-3 py-2 font-semibold">Merma %</th>
                          <th className="px-3 py-2 font-semibold">Costo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {recetaEnDetalle.ingredientes.map((ingrediente, index) => (
                          <tr key={`${recetaEnDetalle.id}-${index}`}>
                            <td className="px-3 py-2 font-medium text-[#171717]">
                              {ingrediente.ingrediente}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {ingrediente.cantidadBruta}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {ingrediente.unidad}
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {ingrediente.porcentajeMerma}%
                            </td>
                            <td className="px-3 py-2 text-[#171717]">
                              {ingrediente.costoEstimado > 0
                                ? `$${ingrediente.costoEstimado}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                    Elaboración
                  </p>
                  <div className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-[#171717]">
                    {recetaEnDetalle.procedimiento || 'Sin procedimiento cargado.'}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 justify-end border-t border-neutral-100 bg-white px-5 py-4">
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="min-h-10 rounded-xl border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-5 py-4 shadow-sm sm:px-8 xl:px-10">
        <button
          type="button"
          onClick={() => {
            setIsCreating(false)
            resetFormulario()
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-neutral-100"
        >
          <span aria-hidden>←</span>
          Volver al recetario
        </button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#CD1818]">
          Nueva receta
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#8997A6]">
          Completá la ficha técnica con datos generales, ingredientes y
          elaboración. Este módulo funciona como biblioteca documental
          independiente.
        </p>
      </div>

      <form onSubmit={handleGuardar} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-32 pt-6 sm:px-8 sm:pb-36 lg:px-14 xl:px-20 2xl:px-24">
          <div className="mx-auto max-w-6xl space-y-8">
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Datos generales
                </p>
                <p className="mt-1 text-sm text-[#8997A6]">
                  Definí la información base de la ficha técnica.
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
                <label className="block xl:col-span-2">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Nombre
                  </span>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className={inputBaseClass}
                    placeholder="Ej. Pastel de papas"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Categoría
                  </span>
                  <select
                    value={categoria}
                    onChange={(e) =>
                      setCategoria(e.target.value as CategoriaReceta)
                    }
                    className={inputBaseClass}
                  >
                    {CATEGORIAS_RECETA.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Rendimiento (porciones)
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={rendimientoPorciones}
                    onChange={(e) => setRendimientoPorciones(e.target.value)}
                    className={inputBaseClass}
                    placeholder="0"
                    required
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={aceptaGuarnicion}
                    onChange={(e) => setAceptaGuarnicion(e.target.checked)}
                    disabled={categoria === 'Guarnición'}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#171717]">
                      Acepta guarnición
                    </span>
                    <span className="mt-1 block text-xs text-[#8997A6]">
                      Solo aplica para platos principales.
                    </span>
                  </span>
                </label>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                    Dietas compatibles
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {DIETAS_RECETA.map((dieta) => (
                      <label
                        key={dieta}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm"
                      >
                        <input
                          type="checkbox"
                          checked={dietas.includes(dieta)}
                          onChange={() => toggleDieta(dieta)}
                          className="mt-1 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                        />
                        <span className="text-sm text-[#171717]">{dieta}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Ingredientes
                </p>
                <p className="mt-1 text-sm text-[#8997A6]">
                  Cargá cantidades, unidad, merma y costo estimado por
                  ingrediente.
                </p>
              </div>

              <div className="mb-4 hidden rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 lg:block">
                <div className="grid gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8997A6] lg:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]">
                  <span>Ingrediente</span>
                  <span>Cantidad Bruta</span>
                  <span>Unidad</span>
                  <span>Merma %</span>
                  <span>Costo opcional</span>
                  <span className="text-right">Acción</span>
                </div>
              </div>

              <div className="space-y-5">
                {filasIngredientes.map((fila, index) => (
                  <div
                    key={fila.key}
                    className="grid gap-5 rounded-xl border border-gray-200 bg-gray-50 p-5 shadow-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] lg:items-end lg:gap-x-4 lg:gap-y-4 lg:p-6"
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Ingrediente
                      </span>
                      <input
                        type="text"
                        value={fila.ingrediente}
                        onChange={(e) =>
                          actualizarFila(index, { ingrediente: e.target.value })
                        }
                        className={inputBaseClass}
                        placeholder="Ej. Carne picada"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Cantidad Bruta
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={fila.cantidadBruta}
                        onChange={(e) =>
                          actualizarFila(index, {
                            cantidadBruta: e.target.value,
                          })
                        }
                        className={inputBaseClass}
                        placeholder="0"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Unidad
                      </span>
                      <select
                        value={fila.unidad}
                        onChange={(e) =>
                          actualizarFila(index, {
                            unidad: e.target.value as UnidadReceta | '',
                          })
                        }
                        className={inputBaseClass}
                      >
                        <option value="">Seleccionar...</option>
                        {UNIDADES_RECETA.map((unidad) => (
                          <option key={unidad} value={unidad}>
                            {unidad}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Merma %
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={fila.porcentajeMerma}
                        onChange={(e) =>
                          actualizarFila(index, {
                            porcentajeMerma: e.target.value,
                          })
                        }
                        className={inputBaseClass}
                        placeholder="0"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Costo opcional
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={fila.costoEstimado}
                        onChange={(e) =>
                          actualizarFila(index, {
                            costoEstimado: e.target.value,
                          })
                        }
                        className={inputBaseClass}
                        placeholder="0"
                      />
                    </label>

                    <div className="flex items-end lg:justify-end">
                      <button
                        type="button"
                        onClick={() => quitarFila(index)}
                        disabled={filasIngredientes.length <= 1}
                        className="min-h-12 rounded-xl px-3 text-sm font-medium text-[#8997A6] underline-offset-2 transition hover:bg-white hover:text-[#CD1818] hover:underline disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <button
                  type="button"
                  onClick={agregarFila}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50 focus-visible:outline-none"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Agregar ingrediente
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="mb-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Elaboración
                </p>
                <p className="mt-1 text-sm text-[#8997A6]">
                  Documentá el paso a paso completo de la preparación.
                </p>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-[#8997A6]">
                  Procedimiento
                </span>
                <textarea
                  value={procedimiento}
                  onChange={(e) => setProcedimiento(e.target.value)}
                  rows={12}
                  className={textAreaClass}
                  placeholder="Describí la mise en place, cocción, armado, tiempos y observaciones."
                  required
                />
              </label>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-14 xl:px-20 2xl:px-24">
          <div className="mx-auto flex max-w-6xl justify-end">
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#CD1818] px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
            >
              {guardando ? 'Guardando…' : 'Guardar receta'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
