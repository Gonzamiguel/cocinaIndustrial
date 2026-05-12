import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import {
  costoTeoricoProduccionPorciones,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'
import {
  lotesDisponiblesParaEgreso,
  opcionesHistorialAmplio,
  registrarProduccionCocina,
  subscribeMovimientosInventarioPorUbicacion,
  type ItemMovimientoInventario,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import { selectClassComanda, inputClassComanda } from '../campamento/comandasFormShared'

type FilaProd = {
  insumoId: string
  nombre: string
  unidad: string
  cantidadTeorica: number
  cantidadReal: string
  loteKey: string | null
}

function construirFilasDesdeReceta(
  receta: RecetaTecnica,
  porciones: number,
  movimientos: MovimientoInventario[],
  ub: string,
  insumoPorId: Map<string, Insumo>,
): FilaProd[] {
  const rend = Math.max(1, Math.floor(receta.rendimientoPorciones) || 1)
  const p = Number(porciones)
  const factor = Number.isFinite(p) && p > 0 ? p / rend : 0

  const acum = new Map<
    string,
    { nombre: string; unidad: string; teorico: number }
  >()

  for (const ing of receta.ingredientes) {
    const id = ing.insumoId?.trim()
    if (!id) continue
    const teorico =
      ing.cantidadBruta * (1 + Math.max(0, ing.porcentajeMerma) / 100) * factor
    const prev = acum.get(id)
    const nombre = ing.ingrediente.trim() || id
    if (prev) {
      acum.set(id, { ...prev, teorico: prev.teorico + teorico })
    } else {
      acum.set(id, { nombre, unidad: ing.unidad, teorico })
    }
  }

  const filas: FilaProd[] = []
  for (const [insumoId, v] of acum) {
    const lotes = lotesDisponiblesParaEgreso(movimientos, insumoId, ub)
    const teorRounded = Math.round(v.teorico * 10000) / 10000
    let loteKey: string | null = null
    for (const l of lotes) {
      if (l.stock > 1e-9) {
        loteKey = l.loteKey
        break
      }
    }
    const ins = insumoPorId.get(insumoId)
    filas.push({
      insumoId,
      nombre: ins ? formatLabelInsumo(ins) : v.nombre,
      unidad: v.unidad,
      cantidadTeorica: teorRounded,
      cantidadReal: teorRounded > 0 ? String(teorRounded) : '',
      loteKey,
    })
  }

  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

type AdminProduccionCocinaTabProps = {
  className?: string
  onAfterSuccess?: () => void
}

export function AdminProduccionCocinaTab({
  className,
  onAfterSuccess,
}: AdminProduccionCocinaTabProps) {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [recetaId, setRecetaId] = useState('')
  const [porcionesStr, setPorcionesStr] = useState('1')
  const [insumoProductoId, setInsumoProductoId] = useState('')
  const [filas, setFilas] = useState<FilaProd[]>([])
  const [guardando, setGuardando] = useState(false)

  const ub = ubicacionId?.trim().toUpperCase() ?? ''

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeRecetario(setRecetas), [])

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

  const insumoPorId = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  const recetaSeleccionada = useMemo(
    () => recetas.find((r) => r.id === recetaId) ?? null,
    [recetas, recetaId],
  )

  const porciones = Number(porcionesStr.replace(',', '.'))

  const recalcularFilas = useCallback(() => {
    if (!recetaSeleccionada || !ub || !Number.isFinite(porciones) || porciones <= 0) {
      setFilas([])
      return
    }
    setFilas(construirFilasDesdeReceta(recetaSeleccionada, porciones, movimientos, ub, insumoPorId))
  }, [recetaSeleccionada, porciones, movimientos, ub, insumoPorId])

  useEffect(() => {
    recalcularFilas()
  }, [recalcularFilas])

  const costoTeorico = useMemo(() => {
    if (!recetaSeleccionada || !Number.isFinite(porciones) || porciones <= 0) return 0
    return costoTeoricoProduccionPorciones(insumos, recetaSeleccionada, porciones)
  }, [insumos, recetaSeleccionada, porciones])

  function actualizarFila(i: number, patch: Partial<FilaProd>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ub) {
      showToast('No hay ubicación de cocina asignada.', 'error')
      return
    }
    if (!recetaSeleccionada) {
      showToast('Seleccioná una receta.', 'error')
      return
    }
    if (!Number.isFinite(porciones) || porciones <= 0) {
      showToast('Indicá una cantidad de porciones válida.', 'error')
      return
    }
    const prodId = insumoProductoId.trim()
    if (!prodId) {
      showToast('Seleccioná el insumo de plato terminado (catálogo).', 'error')
      return
    }
    const insProd = insumoPorId.get(prodId)
    if (!insProd) {
      showToast('El producto terminado no está en el catálogo.', 'error')
      return
    }

    const items: ItemMovimientoInventario[] = []
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      const cant = Number(f.cantidadReal.replace(',', '.'))
      if (!Number.isFinite(cant) || cant <= 0) continue
      if (f.loteKey === null) {
        showToast(`Elegí un lote para «${f.nombre}».`, 'error')
        return
      }
      const ins = insumoPorId.get(f.insumoId)
      if (!ins) {
        showToast(`Insumo inválido en fila ${i + 1}.`, 'error')
        return
      }
      const lotes = lotesDisponiblesParaEgreso(movimientos, f.insumoId, ub)
      const loteRow = lotes.find((l) => l.loteKey === f.loteKey)
      if (!loteRow) {
        showToast(`El lote ya no está disponible para «${f.nombre}».`, 'error')
        return
      }
      if (cant > loteRow.stock + 1e-9) {
        showToast(
          `La cantidad de «${f.nombre}» supera el stock del lote (${loteRow.stock.toLocaleString('es-AR', { maximumFractionDigits: 4 })}).`,
          'error',
        )
        return
      }
      items.push({
        insumoId: f.insumoId,
        nombreSnapshot: formatLabelInsumo(ins),
        cantidad: cant,
        lote: loteRow.lotePersistido || undefined,
        fechaVencimiento: loteRow.fechaVencimiento ?? undefined,
        controlCalidadOk: true,
        costoPorUnidadBaseSnapshot: ins.costoPorUnidadBase,
      })
    }

    if (items.length === 0) {
      showToast('Indicá al menos un insumo consumido con cantidad mayor a cero.', 'error')
      return
    }

    const loteProducto = `PROD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase()

    setGuardando(true)
    try {
      await registrarProduccionCocina({
        ubicacionId: ub,
        fecha: new Date(),
        recetaId: recetaSeleccionada.id,
        recetaNombre: recetaSeleccionada.nombre,
        cantidadPorciones: porciones,
        insumoProductoId: prodId,
        nombreProductoSnapshot: formatLabelInsumo(insProd),
        loteProductoTerminado: loteProducto,
        itemsEgreso: items,
        costoTeoricoTotal: costoTeorico,
      })
      showToast('Producción registrada: egreso de insumos e ingreso de platos terminados.')
      setPorcionesStr('1')
      setFilas([])
      setRecetaId('')
      setInsumoProductoId('')
      onAfterSuccess?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo registrar la producción.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  if (!ubicacionId) {
    return (
      <p className="text-sm text-neutral-600">
        No hay ubicación asignada. Configurá <code className="rounded bg-neutral-100 px-1 text-xs">ubicacionId</code> en tu usuario o usá el valor por defecto COCINA.
      </p>
    )
  }

  const insumosOrdenados = useMemo(
    () => [...insumos].sort((a, b) =>
      formatLabelInsumo(a).localeCompare(formatLabelInsumo(b), 'es', { sensitivity: 'base' }),
    ),
    [insumos],
  )

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={`flex min-h-0 flex-1 flex-col gap-6 ${className ?? ''}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-[#171717]">
          Receta
          <select
            value={recetaId}
            onChange={(e) => setRecetaId(e.target.value)}
            className={selectClassComanda}
          >
            <option value="">— Elegir —</option>
            {recetas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-[#171717]">
          Cantidad producida (porciones)
          <input
            type="number"
            min={0.01}
            step="any"
            value={porcionesStr}
            onChange={(e) => setPorcionesStr(e.target.value)}
            className={inputClassComanda}
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-[#171717]">
        Plato terminado (insumo en catálogo)
        <select
          value={insumoProductoId}
          onChange={(e) => setInsumoProductoId(e.target.value)}
          className={selectClassComanda}
        >
          <option value="">— Elegir insumo de salida —</option>
          {insumosOrdenados.map((i) => (
            <option key={i.id} value={i.id}>
              {formatLabelInsumo(i)}
            </option>
          ))}
        </select>
      </label>

      {recetaSeleccionada && filas.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Esta receta no tiene ingredientes vinculados al catálogo (<code className="text-xs">insumoId</code>).
          Editá el recetario para asociar insumos y poder descontar stock.
        </p>
      ) : null}

      {filas.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-neutral-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
              Insumos — teórico vs real
            </p>
            <p className="mt-0.5 text-xs text-[#8997A6]">
              Costo teórico del lote (ARS):{' '}
              <span className="font-semibold text-[#171717]">
                {costoTeorico.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 text-xs uppercase tracking-wide text-[#8997A6]">
                <tr>
                  <th className="px-3 py-3">Insumo</th>
                  <th className="px-3 py-3">Unidad receta</th>
                  <th className="px-3 py-3 text-right">Teórico</th>
                  <th className="px-3 py-3">Lote</th>
                  <th className="px-3 py-3 text-right">Real consumido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filas.map((f, i) => {
                  const lotes = lotesDisponiblesParaEgreso(movimientos, f.insumoId, ub)
                  return (
                    <tr key={f.insumoId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#171717]">{f.nombre}</p>
                        <p className="text-xs text-[#8997A6]">{f.insumoId}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[#171717]">{f.unidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#171717]">
                        {f.cantidadTeorica.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <select
                          value={f.loteKey ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            actualizarFila(i, { loteKey: v === '' ? null : v })
                          }}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#CD1818]/15"
                        >
                          <option value="">— Lote —</option>
                          {lotes.map((l) => (
                            <option key={l.loteKey || '__empty'} value={l.loteKey}>
                              {(l.lotePersistido || '(sin lote)').slice(0, 28)}
                              {l.fechaVencimiento ? ` · vto ${l.fechaVencimiento}` : ''} — stock{' '}
                              {l.stock.toLocaleString('es-AR', { maximumFractionDigits: 3 })}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={f.cantidadReal}
                          onChange={(e) => actualizarFila(i, { cantidadReal: e.target.value })}
                          className="ml-auto w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-[#CD1818]/15"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex shrink-0 flex-wrap justify-end gap-3 border-t border-neutral-100 pt-4">
        <button
          type="submit"
          disabled={guardando || filas.length === 0}
          className="rounded-xl bg-[#CD1818] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {guardando ? 'Guardando…' : 'Registrar producción'}
        </button>
      </div>
    </form>
  )
}
