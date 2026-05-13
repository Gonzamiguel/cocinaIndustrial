import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import {
  calcularStockPorInsumo,
  guardarComandaConsumoDiario,
  lotesDisponiblesParaEgreso,
  subscribeMovimientosInventarioPorUbicacion,
  opcionesHistorialAmplio,
  type ItemMovimientoInventario,
  type LoteDisponibleEgreso,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  inputClassComanda,
  nuevaFila,
  OPT_LOTE_PLACEHOLDER,
  OPT_LOTE_SIN,
  selectClassComanda,
  stockDisponibleEnComanda,
  type FilaComanda,
} from './comandasFormShared'

function formatFechaVencimiento(value: string | null): string {
  if (!value) return 'Sin fecha'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

export function CampamentoNuevaComandaPage() {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [filas, setFilas] = useState<FilaComanda[]>(() => [nuevaFila()])
  const [observaciones, setObservaciones] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    if (!ubicacionId) {
      setMovimientos([])
      return
    }
    return subscribeMovimientosInventarioPorUbicacion(
      ubicacionId,
      setMovimientos,
      opcionesHistorialAmplio(35000),
    )
  }, [ubicacionId])

  const ub = ubicacionId?.trim().toUpperCase() ?? ''

  const stockPorInsumo = useMemo(
    () => calcularStockPorInsumo(movimientos, { ubicacionId: ub }),
    [movimientos, ub],
  )

  const insumosConStock = useMemo(() => {
    if (!ub) return []
    return insumos.filter((i) => {
      const s = stockPorInsumo.get(i.id) ?? 0
      if (s <= 0) return false
      const lotes = lotesDisponiblesParaEgreso(movimientos, i.id, ub)
      return lotes.some((l) => l.stock > 0)
    })
  }, [insumos, movimientos, stockPorInsumo, ub])

  const insumoPorId = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  const actualizarFila = useCallback((index: number, patch: Partial<FilaComanda>) => {
    setFilas((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    )
  }, [])

  const agregarFila = useCallback(() => {
    setFilas((prev) => [...prev, nuevaFila()])
  }, [])

  const quitarFila = useCallback((index: number) => {
    setFilas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  function lotesParaFila(insumoId: string): LoteDisponibleEgreso[] {
    if (!insumoId || !ub) return []
    return lotesDisponiblesParaEgreso(movimientos, insumoId, ub)
  }

  async function handleGuardar(e: FormEvent) {
    e.preventDefault()
    if (!ub) {
      showToast('No hay sucursal asignada.', 'error')
      return
    }

    const items: ItemMovimientoInventario[] = []
    const filasConError: string[] = []

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      if (!f.insumoId.trim()) continue
      if (f.loteKey === null) {
        filasConError.push(`Fila ${i + 1}: elegí un lote.`)
        continue
      }
      const insumo = insumoPorId.get(f.insumoId)
      if (!insumo) {
        filasConError.push(`Fila ${i + 1}: insumo inválido.`)
        continue
      }
      const lotes = lotesDisponiblesParaEgreso(movimientos, f.insumoId, ub)
      const loteRow = lotes.find((l) => l.loteKey === f.loteKey)
      if (!loteRow) {
        filasConError.push(`Fila ${i + 1}: el lote ya no está disponible.`)
        continue
      }
      const cant = Number(f.cantidad)
      if (!Number.isFinite(cant) || cant <= 0) {
        filasConError.push(`Fila ${i + 1}: indicá una cantidad mayor a cero.`)
        continue
      }
      const maxPermitido = stockDisponibleEnComanda(
        filas,
        i,
        f.insumoId,
        f.loteKey,
        movimientos,
        ub,
      )
      if (cant > maxPermitido + 1e-9) {
        filasConError.push(
          `Fila ${i + 1}: la cantidad no puede superar el stock disponible (${maxPermitido}).`,
        )
        continue
      }

      items.push({
        insumoId: f.insumoId,
        nombreSnapshot: formatLabelInsumo(insumo),
        cantidad: cant,
        lote: loteRow.lotePersistido || undefined,
        fechaVencimiento: loteRow.fechaVencimiento ?? undefined,
        controlCalidadOk: true,
        costoPorUnidadBaseSnapshot: insumo.costoPorUnidadBase,
      })
    }

    if (filasConError.length > 0) {
      showToast(filasConError[0], 'error')
      return
    }
    if (items.length === 0) {
      showToast('Agregá al menos un ítem con insumo, lote y cantidad.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await guardarComandaConsumoDiario({
        ubicacionId: ub,
        fecha: new Date(),
        items,
        observacionesComanda: observaciones.trim() || undefined,
      })
      showToast('Comanda guardada. El stock local se actualizó.', 'success')
      setFilas([nuevaFila()])
      setObservaciones('')
      navigate('/campamento/comandas', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la comanda.'
      showToast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!ubicacionId) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-6">
        <p className="text-center text-sm text-neutral-600">
          No hay sucursal asignada. Configurá{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">ubicacionId</code> en tu usuario.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-8">
        <Link
          to="/campamento/comandas"
          aria-disabled={isSubmitting}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-100 ${isSubmitting ? 'pointer-events-none opacity-45' : ''}`}
        >
          <span aria-hidden>←</span>
          Volver al historial
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <ClipboardList
            className="mt-0.5 h-7 w-7 shrink-0 text-[#CD1818]"
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Nueva comanda
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Consumo diario en{' '}
              <span className="font-mono text-xs text-[#171717]">{ub}</span>. Elegí insumo, lote
              (FEFO) y cantidad sin superar el stock del lote.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-8 sm:px-6 lg:px-10">
        <form
          onSubmit={(ev) => void handleGuardar(ev)}
          className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10"
        >
          <fieldset
            disabled={isSubmitting}
            className="m-0 min-w-0 border-0 p-0 disabled:opacity-[0.92]"
          >
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
              Observaciones{' '}
              <span className="font-normal normal-case text-[#8997A6]">(opcional)</span>
            </span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              placeholder='Ej. "Cena turno noche", "Viandas mineros"'
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
            />
          </label>

          <div className="mt-8 hidden rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 lg:block">
            <div className="grid gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8997A6] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,0.9fr)_auto]">
              <span>Insumo</span>
              <span>Lote (FEFO)</span>
              <span>Cantidad</span>
              <span className="text-right">Quitar</span>
            </div>
          </div>

          <div className="mt-3 space-y-4">
            {filas.map((fila, index) => {
              const lotes = lotesParaFila(fila.insumoId)
              const loteKeyResolved = fila.loteKey
              const maxQty =
                fila.insumoId && loteKeyResolved !== null
                  ? stockDisponibleEnComanda(
                      filas,
                      index,
                      fila.insumoId,
                      loteKeyResolved,
                      movimientos,
                      ub,
                    )
                  : 0

              const selectLoteValue =
                fila.loteKey === null
                  ? OPT_LOTE_PLACEHOLDER
                  : fila.loteKey === ''
                    ? OPT_LOTE_SIN
                    : fila.loteKey

              return (
                <div
                  key={fila.key}
                  className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,0.9fr)_auto] lg:items-end"
                >
                  <label className="block min-w-0">
                    <span className="text-xs font-medium text-[#8997A6] lg:hidden">
                      Insumo
                    </span>
                    <select
                      value={fila.insumoId}
                      onChange={(e) => {
                        const v = e.target.value
                        actualizarFila(index, {
                          insumoId: v,
                          loteKey: null,
                          cantidad: '',
                        })
                      }}
                      className={selectClassComanda}
                    >
                      <option value="">Elegí insumo…</option>
                      {insumosConStock.map((i) => (
                        <option key={i.id} value={i.id}>
                          {formatLabelInsumo(i)} — stock{' '}
                          {(stockPorInsumo.get(i.id) ?? 0).toLocaleString('es-AR', {
                            maximumFractionDigits: 4,
                          })}{' '}
                          {i.unidadBase}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-0">
                    <span className="text-xs font-medium text-[#8997A6] lg:hidden">
                      Lote
                    </span>
                    <select
                      value={selectLoteValue}
                      disabled={!fila.insumoId}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === OPT_LOTE_PLACEHOLDER) {
                          actualizarFila(index, { loteKey: null, cantidad: '' })
                        } else if (v === OPT_LOTE_SIN) {
                          actualizarFila(index, { loteKey: '', cantidad: '' })
                        } else {
                          actualizarFila(index, { loteKey: v, cantidad: '' })
                        }
                      }}
                      className={`${selectClassComanda} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-[#8997A6]`}
                    >
                      <option value={OPT_LOTE_PLACEHOLDER}>Elegí lote…</option>
                      {lotes.map((l) => {
                        const disp = stockDisponibleEnComanda(
                          filas,
                          index,
                          fila.insumoId,
                          l.loteKey,
                          movimientos,
                          ub,
                        )
                        const optVal = l.loteKey === '' ? OPT_LOTE_SIN : l.loteKey
                        const labelLote = l.lotePersistido.trim() || 'Sin lote'
                        return (
                          <option key={optVal} value={optVal}>
                            {labelLote} · Venc. {formatFechaVencimiento(l.fechaVencimiento)} ·
                            Disp. {disp.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                          </option>
                        )
                      })}
                    </select>
                  </label>

                  <div className="min-w-0">
                    <label className="block">
                      <span className="text-xs font-medium text-[#8997A6] lg:hidden">
                        Cantidad
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        disabled={!fila.insumoId || fila.loteKey === null}
                        max={maxQty > 0 ? maxQty : undefined}
                        value={fila.cantidad}
                        onChange={(e) => {
                          let raw = e.target.value
                          const n = Number(raw)
                          if (raw !== '' && Number.isFinite(n) && maxQty > 0 && n > maxQty) {
                            raw = String(maxQty)
                          }
                          actualizarFila(index, { cantidad: raw })
                        }}
                        className={`${inputClassComanda} disabled:cursor-not-allowed disabled:bg-gray-100`}
                        placeholder="0"
                      />
                    </label>
                    {fila.insumoId && fila.loteKey !== null && maxQty >= 0 ? (
                      <p className="mt-1 text-xs text-[#8997A6]">
                        Máx. en esta comanda:{' '}
                        <span className="font-semibold tabular-nums text-[#171717]">
                          {maxQty.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-end lg:pb-2">
                    <button
                      type="button"
                      onClick={() => quitarFila(index)}
                      disabled={filas.length <= 1}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-[#8997A6] transition hover:border-[#CD1818]/40 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Quitar fila"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={agregarFila}
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              Agregar fila
            </button>
            <button
              type="submit"
              disabled={isSubmitting || insumosConStock.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-8 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                'Guardar comanda'
              )}
            </button>
          </div>

          {insumosConStock.length === 0 ? (
            <p className="mt-6 text-center text-sm text-[#CD1818]">
              No hay insumos con stock disponible en esta sucursal. Recepcioná mercadería antes de
              cargar comandas.
            </p>
          ) : null}
          </fieldset>
        </form>
      </div>
    </div>
  )
}
