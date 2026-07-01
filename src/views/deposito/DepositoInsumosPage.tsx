import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  subscribeCategorias,
  type Categoria,
} from '../../lib/categorias'
import { useToast } from '../../context/ToastContext'
import {
  UNIDADES_BASE_INSUMO,
  actualizarInsumo,
  computeCostoPorUnidadBase,
  crearInsumo,
  eliminarInsumo,
  formatLabelInsumo,
  subscribeInsumos,
  type CrearInsumoInput,
  type Insumo,
  type PresentacionInsumo,
  type UnidadBaseInsumo,
} from '../../lib/insumos'
import { nuevaPresentacionInsumo } from '../../lib/presentacionesInsumo'

const inputClass =
  'mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

const iconActionClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-neutral-600 shadow-sm transition hover:border-[#CD1818]/30 hover:text-[#CD1818] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/20'

const iconActionPrimaryClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CD1818] bg-[#CD1818] text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/30'

const iconActionDangerClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-neutral-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/50'

function DetalleCampo({
  label,
  value,
  className = '',
  destacado = false,
}: {
  label: string
  value: ReactNode
  className?: string
  destacado?: boolean
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums text-neutral-900 ${
          destacado ? 'text-base text-[#CD1818]' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function DepositoInsumosPage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  /** Vista formulario completa (alta o edición), igual que «Nueva receta» en recetario */
  const [isCreating, setIsCreating] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [detalleModalId, setDetalleModalId] = useState<string | null>(null)

  const [nombreGenerico, setNombreGenerico] = useState('')
  const [marca, setMarca] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [rubro, setRubro] = useState('')
  const [subrubro, setSubrubro] = useState('')
  const [presentacion, setPresentacion] = useState('')
  const [unidadBase, setUnidadBase] = useState<UnidadBaseInsumo>('Kg')
  const [contenidoNeto, setContenidoNeto] = useState('')
  const [costoEnvase, setCostoEnvase] = useState('')
  const [presentacionesEmpaque, setPresentacionesEmpaque] = useState<PresentacionInsumo[]>(
    [],
  )

  useEffect(() => {
    return subscribeInsumos((rows) => {
      setItems(rows)
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    return subscribeCategorias(setCategorias)
  }, [])

  useEffect(() => {
    if (!detalleModalId) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDetalleModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detalleModalId])

  const insumoEnDetalle = useMemo(() => {
    if (!detalleModalId) return null
    return items.find((i) => i.id === detalleModalId) ?? null
  }, [detalleModalId, items])

  const previewCostoBase = useMemo(() => {
    const net = Number(contenidoNeto)
    const costo = Number(costoEnvase)
    return computeCostoPorUnidadBase(costo, net)
  }, [contenidoNeto, costoEnvase])

  function resetFormulario() {
    setEditandoId(null)
    setNombreGenerico('')
    setMarca('')
    setRubro('')
    setSubrubro('')
    setPresentacion('')
    setUnidadBase('Kg')
    setContenidoNeto('')
    setCostoEnvase('')
    setPresentacionesEmpaque([])
  }

  function cargarParaEditar(row: Insumo) {
    setEditandoId(row.id)
    setNombreGenerico(row.nombreGenerico)
    setMarca(row.marca)
    setRubro(row.rubro)
    setSubrubro(row.subrubro)
    setPresentacion(row.presentacion)
    setUnidadBase(row.unidadBase)
    setContenidoNeto(String(row.contenidoNeto))
    setCostoEnvase(String(row.costoEnvase))
    setPresentacionesEmpaque(row.presentaciones ? [...row.presentaciones] : [])
  }

  function abrirNuevo() {
    resetFormulario()
    setIsCreating(true)
  }

  function abrirEditar(row: Insumo) {
    cargarParaEditar(row)
    setDetalleModalId(null)
    setIsCreating(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: CrearInsumoInput = {
      nombreGenerico,
      marca,
      rubro,
      subrubro,
      presentacion,
      unidadBase,
      contenidoNeto: Number(contenidoNeto),
      costoEnvase: Number(costoEnvase),
      presentaciones: presentacionesEmpaque,
    }
    setGuardando(true)
    try {
      if (editandoId) {
        await actualizarInsumo(editandoId, payload)
        showToast('Insumo actualizado.')
      } else {
        await crearInsumo(payload)
        showToast('Insumo creado.')
      }
      resetFormulario()
      setIsCreating(false)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo guardar el insumo.',
        'error',
      )
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este insumo del catálogo?')) return
    try {
      await eliminarInsumo(id)
      showToast('Insumo eliminado.')
      if (detalleModalId === id) setDetalleModalId(null)
      if (editandoId === id) {
        resetFormulario()
        setIsCreating(false)
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo eliminar.',
        'error',
      )
    }
  }

  const labelUnidadBase = (u: UnidadBaseInsumo) =>
    u === 'Kg' ? 'kilogramo' : u === 'Lt' ? 'litro' : 'unidad'

  const categoriaSeleccionada = useMemo(
    () => categorias.find((item) => item.nombre === rubro) ?? null,
    [categorias, rubro],
  )

  const rubrosDisponibles = useMemo(() => {
    const base = categorias.map((item) => item.nombre)
    if (rubro && !base.includes(rubro)) return [...base, rubro]
    return base
  }, [categorias, rubro])

  const subrubrosDisponibles = useMemo(() => {
    const base = categoriaSeleccionada?.subrubros ?? []
    if (subrubro && !base.includes(subrubro)) return [...base, subrubro]
    return base
  }, [categoriaSeleccionada, subrubro])

  /** Vista lista + modal detalle (como recetario) */
  if (!isCreating) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-gray-50">
        <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[#CD1818]">
                Catálogo de insumos
              </h1>
            </div>
            <button
              type="button"
              onClick={abrirNuevo}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <span className="text-xl leading-none">+</span>
              Nuevo insumo
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Insumos registrados
              </h2>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                Consultá el detalle, editá o eliminá ítems del catálogo.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Rubro</th>
                    <th className="px-4 py-3 font-semibold">Subrubro</th>
                    <th className="px-4 py-3 font-semibold">Unidad base</th>
                    <th className="px-4 py-3 font-semibold">Contenido</th>
                    <th className="px-4 py-3 font-semibold">Costo envase</th>
                    <th className="px-4 py-3 font-semibold">Costo / base</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cargando ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        Cargando catálogo…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        No hay insumos aún. Creá uno con «Nuevo insumo».
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3 font-medium text-[#171717]">
                          {formatLabelInsumo(row)}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {row.rubro || '—'}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {row.subrubro || '—'}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {row.unidadBase}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#171717]">
                          {row.contenidoNeto}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#171717]">
                          ${' '}
                          {row.costoEnvase.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-[#171717]">
                          ${' '}
                          {row.costoPorUnidadBase.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetalleModalId(row.id)}
                              className={iconActionClass}
                              aria-label={`Ver detalle de ${formatLabelInsumo(row)}`}
                              title="Ver detalle"
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirEditar(row)}
                              className={iconActionPrimaryClass}
                              aria-label={`Editar ${formatLabelInsumo(row)}`}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleEliminar(row.id)}
                              className={iconActionDangerClass}
                              aria-label={`Eliminar ${formatLabelInsumo(row)}`}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {insumoEnDetalle ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:p-6"
            role="presentation"
            onClick={() => setDetalleModalId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-insumo-titulo"
              className="w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {insumoEnDetalle.rubro ? (
                      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                        {insumoEnDetalle.rubro}
                      </span>
                    ) : null}
                    {insumoEnDetalle.subrubro ? (
                      <span className="rounded-full bg-[#CD1818]/8 px-2.5 py-0.5 text-xs font-semibold text-[#CD1818]">
                        {insumoEnDetalle.subrubro}
                      </span>
                    ) : null}
                  </div>
                  <h2
                    id="modal-insumo-titulo"
                    className="mt-2 text-xl font-semibold leading-snug text-neutral-900"
                  >
                    {formatLabelInsumo(insumoEnDetalle)}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="shrink-0 rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="Cerrar"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                  <DetalleCampo
                    label="Nombre genérico"
                    value={insumoEnDetalle.nombreGenerico || '—'}
                  />
                  <DetalleCampo
                    label="Marca"
                    value={insumoEnDetalle.marca || '—'}
                  />
                  <DetalleCampo
                    label="Presentación"
                    value={insumoEnDetalle.presentacion || '—'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-4 sm:grid-cols-4">
                  <DetalleCampo
                    label="Unidad base"
                    value={insumoEnDetalle.unidadBase}
                  />
                  <DetalleCampo
                    label="Contenido neto"
                    value={`${insumoEnDetalle.contenidoNeto} ${insumoEnDetalle.unidadBase}`}
                  />
                  <DetalleCampo
                    label="Costo envase"
                    value={`$ ${insumoEnDetalle.costoEnvase.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                  />
                  <DetalleCampo
                    label={`Costo / ${labelUnidadBase(insumoEnDetalle.unidadBase)}`}
                    value={`$ ${insumoEnDetalle.costoPorUnidadBase.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}`}
                    destacado
                  />
                </div>

                {insumoEnDetalle.presentaciones &&
                insumoEnDetalle.presentaciones.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      Presentaciones de empaque
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {insumoEnDetalle.presentaciones.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800"
                        >
                          <span className="font-medium">{p.nombre}</span>
                          <span className="ml-1.5 text-neutral-500">
                            ×{p.factorMultiplicador} {insumoEnDetalle.unidadBase}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setDetalleModalId(null)}
                  className="min-h-10 rounded-xl border border-neutral-200 bg-white px-5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => abrirEditar(insumoEnDetalle)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  /** Vista formulario dedicada (alta / edición) */
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-8">
        <button
          type="button"
          onClick={() => {
            setIsCreating(false)
            resetFormulario()
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-100"
        >
          <span aria-hidden>←</span>
          Volver al catálogo
        </button>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#CD1818]">
          {editandoId ? 'Editar insumo' : 'Nuevo insumo'}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-6 sm:px-8 sm:pb-32 lg:px-14">
          <div className="mx-auto max-w-4xl space-y-8">
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-sm sm:p-7">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Datos del producto
              </h2>
              <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Nombre genérico
                  </span>
                  <input
                    required
                    value={nombreGenerico}
                    onChange={(e) => setNombreGenerico(e.target.value)}
                    className={inputClass}
                    placeholder="Ej. Tomate perita"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Marca
                  </span>
                  <input
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    className={inputClass}
                    placeholder="Ej. Arcor"
                  />
                </label>
                <label className="block md:col-span-2 lg:col-span-1">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Rubro
                  </span>
                  <select
                    required
                    value={rubro}
                    onChange={(e) => {
                      const nextRubro = e.target.value
                      setRubro(nextRubro)
                      const categoria = categorias.find(
                        (item) => item.nombre === nextRubro,
                      )
                      const primerSubrubro = categoria?.subrubros[0] ?? ''
                      setSubrubro(primerSubrubro)
                    }}
                    className={inputClass}
                  >
                    <option value="">Seleccionar…</option>
                    {rubrosDisponibles.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Subrubro
                  </span>
                  <select
                    required
                    value={subrubro}
                    onChange={(e) => setSubrubro(e.target.value)}
                    disabled={!rubro}
                    className={inputClass}
                  >
                    <option value="">
                      {rubro ? 'Seleccionar…' : 'Elegí un rubro primero'}
                    </option>
                    {subrubrosDisponibles.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block md:col-span-2 lg:col-span-1">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Presentación
                  </span>
                  <input
                    required
                    value={presentacion}
                    onChange={(e) => setPresentacion(e.target.value)}
                    className={inputClass}
                    placeholder="Ej. Lata 500g"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Unidad base (receta)
                  </span>
                  <select
                    value={unidadBase}
                    onChange={(e) =>
                      setUnidadBase(e.target.value as UnidadBaseInsumo)
                    }
                    className={inputClass}
                  >
                    {UNIDADES_BASE_INSUMO.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Contenido neto ({unidadBase})
                  </span>
                  <input
                    required
                    type="number"
                    min={0.0001}
                    step="any"
                    value={contenidoNeto}
                    onChange={(e) => setContenidoNeto(e.target.value)}
                    className={inputClass}
                    placeholder="Ej. 0.5"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Costo del envase ($)
                  </span>
                  <input
                    required
                    type="number"
                    min={0}
                    step="any"
                    value={costoEnvase}
                    onChange={(e) => setCostoEnvase(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </label>
              </div>

              <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                      Presentaciones de empaque disponibles
                    </h2>
                    <p className="mt-1 text-xs text-[#8997A6]">
                      Definí cajas, packs o bidones. En movimientos el usuario elige el
                      empaque y el sistema convierte a {unidadBase}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPresentacionesEmpaque((prev) => [
                        ...prev,
                        nuevaPresentacionInsumo(),
                      ])
                    }
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[#CD1818]/30 bg-white px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-[#CD1818]/5"
                  >
                    + Agregar presentación
                  </button>
                </div>
                {presentacionesEmpaque.length === 0 ? (
                  <p className="mt-4 text-sm text-[#8997A6]">
                    Sin empaques alternativos: solo se usará la unidad base ({unidadBase}).
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {presentacionesEmpaque.map((p, idx) => (
                      <li
                        key={p.id}
                        className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[1fr_140px_auto]"
                      >
                        <label className="block min-w-0">
                          <span className="text-xs font-medium text-[#8997A6]">
                            Nombre del empaque
                          </span>
                          <input
                            value={p.nombre}
                            onChange={(e) => {
                              const v = e.target.value
                              setPresentacionesEmpaque((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, nombre: v } : row,
                                ),
                              )
                            }}
                            className={inputClass}
                            placeholder='Ej. "Caja x50"'
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-[#8997A6]">
                            Factor (× {unidadBase})
                          </span>
                          <input
                            type="number"
                            min={0.0001}
                            step="any"
                            value={p.factorMultiplicador || ''}
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              setPresentacionesEmpaque((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        factorMultiplicador: v,
                                      }
                                    : row,
                                ),
                              )
                            }}
                            className={inputClass}
                            placeholder="50"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setPresentacionesEmpaque((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="self-end rounded-xl px-3 py-2 text-sm font-medium text-[#8997A6] transition hover:bg-white hover:text-[#CD1818] sm:self-center"
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="mt-6 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                  Costo por {labelUnidadBase(unidadBase)} (vista previa)
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#171717]">
                  {Number(contenidoNeto) > 0 && Number.isFinite(previewCostoBase)
                    ? `$ ${previewCostoBase.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}`
                    : '—'}
                </p>
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-14">
          <div className="mx-auto flex max-w-4xl justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreating(false)
                resetFormulario()
              }}
              className="min-h-12 rounded-xl border border-gray-300 bg-white px-6 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#CD1818] px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
            >
              {guardando
                ? 'Guardando…'
                : editandoId
                  ? 'Guardar cambios'
                  : 'Guardar insumo'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
