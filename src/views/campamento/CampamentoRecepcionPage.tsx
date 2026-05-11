import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, PackageCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { exportarHojaControlRecepcionPdf } from '../../lib/campamentoRecepcionPdf'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  UBICACION_CAMPAMENTO_CASPOSO,
  confirmarRecepcionTrasladoCampamento,
  subscribeTrasladosPendientesRecepcion,
  type ItemMovimientoInventario,
  type MovimientoEgresoTraslado,
} from '../../lib/movimientosInventario'

function formatFecha(value: Date | null): string {
  if (!value) return '—'
  return value.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFechaVencimiento(value: string | null | undefined): string {
  if (!value?.trim()) return '—'
  const t = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const [y, m, d] = t.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

function etiquetaUbicacion(id: string): string {
  if (id === UBICACION_CAMPAMENTO_CASPOSO) return 'Campamento Casposo'
  return id
}

export function CampamentoRecepcionPage() {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [pendientes, setPendientes] = useState<MovimientoEgresoTraslado[]>([])
  const [egresoSeleccionado, setEgresoSeleccionado] = useState<MovimientoEgresoTraslado | null>(
    null,
  )
  const [itemsRecibidos, setItemsRecibidos] = useState<ItemMovimientoInventario[]>([])
  /** Solo filas con `true` permiten editar la cantidad recibida (flujo de diferencias). */
  const [filaEdicionDiferencia, setFilaEdicionDiferencia] = useState<boolean[]>([])
  const [hojaPdfDescargada, setHojaPdfDescargada] = useState(false)
  const [declaracionConformidad, setDeclaracionConformidad] = useState(false)
  const [soloDiferencias, setSoloDiferencias] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => subscribeInsumos(setInsumos), [])

  useEffect(() => {
    if (!ubicacionId) return
    return subscribeTrasladosPendientesRecepcion(ubicacionId, setPendientes)
  }, [ubicacionId])

  const unidadPorInsumoId = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of insumos) m.set(i.id, i.unidadBase)
    return m
  }, [insumos])

  const abrirPanel = useCallback((mov: MovimientoEgresoTraslado) => {
    setEgresoSeleccionado(mov)
    setItemsRecibidos(mov.items.map((it) => ({ ...it, cantidad: it.cantidad })))
    setFilaEdicionDiferencia(mov.items.map(() => false))
    setHojaPdfDescargada(false)
    setDeclaracionConformidad(false)
    setSoloDiferencias(false)
  }, [])

  const cerrarPanel = useCallback(() => {
    setEgresoSeleccionado(null)
    setItemsRecibidos([])
    setFilaEdicionDiferencia([])
    setHojaPdfDescargada(false)
    setDeclaracionConformidad(false)
    setSoloDiferencias(false)
  }, [])

  useEffect(() => {
    if (!egresoSeleccionado) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrarPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [egresoSeleccionado, cerrarPanel])

  const tituloUbicacion = useMemo(
    () => (ubicacionId ? etiquetaUbicacion(ubicacionId) : '—'),
    [ubicacionId],
  )

  const puedeConfirmarIngreso = useMemo(() => {
    if (!egresoSeleccionado) return false
    if (!hojaPdfDescargada && !declaracionConformidad) return false
    const ok = !itemsRecibidos.some((row, i) => {
      const orig = egresoSeleccionado.items[i]
      if (!orig) return true
      const q = Number(row.cantidad)
      return !Number.isFinite(q) || q < 0 || q > orig.cantidad + 1e-9
    })
    const algunoPositivo = itemsRecibidos.some((row) => Number(row.cantidad) > 0)
    return ok && algunoPositivo
  }, [
    declaracionConformidad,
    egresoSeleccionado,
    hojaPdfDescargada,
    itemsRecibidos,
  ])

  function handleDescargarPdf() {
    if (!egresoSeleccionado) return
    exportarHojaControlRecepcionPdf(egresoSeleccionado, unidadPorInsumoId)
    setHojaPdfDescargada(true)
    showToast('Hoja de control generada. Guardá el PDF desde el navegador si usás vista previa.')
  }

  function marcarTodoRecibido() {
    if (!egresoSeleccionado) return
    setItemsRecibidos(egresoSeleccionado.items.map((it) => ({ ...it, cantidad: it.cantidad })))
    setFilaEdicionDiferencia(egresoSeleccionado.items.map(() => false))
    showToast('Todas las cantidades recibidas igualaron a las enviadas.')
  }

  function activarEdicionDiferencia(index: number) {
    setFilaEdicionDiferencia((prev) =>
      prev.map((v, i) => (i === index ? true : v)),
    )
  }

  function desactivarEdicionDiferencia(index: number) {
    if (!egresoSeleccionado) return
    const orig = egresoSeleccionado.items[index]
    if (!orig) return
    setItemsRecibidos((prev) =>
      prev.map((row, i) => (i === index ? { ...row, cantidad: orig.cantidad } : row)),
    )
    setFilaEdicionDiferencia((prev) => prev.map((v, i) => (i === index ? false : v)))
  }

  function actualizarCantidadRecibida(index: number, valor: string) {
    const n = Number(valor.replace(',', '.'))
    setItemsRecibidos((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              cantidad: Number.isFinite(n) ? n : 0,
            }
          : row,
      ),
    )
  }

  async function handleConfirmarIngreso() {
    if (!egresoSeleccionado || !ubicacionId || !puedeConfirmarIngreso) return
    setGuardando(true)
    try {
      await confirmarRecepcionTrasladoCampamento({
        egresoId: egresoSeleccionado.id,
        ubicacionRecepcionId: ubicacionId,
        itemsRecibidos,
      })
      showToast('Ingreso a stock local registrado correctamente.')
      cerrarPanel()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo registrar la recepción.',
        'error',
      )
    } finally {
      setGuardando(false)
    }
  }

  const indicesVisibles = useMemo(() => {
    if (!egresoSeleccionado) return []
    const out: number[] = []
    for (let i = 0; i < egresoSeleccionado.items.length; i++) {
      if (soloDiferencias) {
        const orig = egresoSeleccionado.items[i]
        const rec = itemsRecibidos[i]?.cantidad
        if (
          orig &&
          Number.isFinite(rec) &&
          Math.abs(Number(rec) - orig.cantidad) > 1e-9
        ) {
          out.push(i)
        }
      } else {
        out.push(i)
      }
    }
    return out
  }, [egresoSeleccionado, itemsRecibidos, soloDiferencias])

  if (!ubicacionId) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-6">
        <p className="text-center text-sm text-neutral-600">
          No hay sucursal asignada en tu perfil. Pedí al administrador el campo{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">ubicacionId</code> en{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">usuarios</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className="h-6 w-6 shrink-0 text-[#CD1818]" aria-hidden />
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Recepción de mercadería
              </h1>
            </div>
            <p className="mt-1 text-sm text-[#8997A6]">
              Traslados hacia <span className="font-medium text-[#171717]">{tituloUbicacion}</span>{' '}
              (<span className="font-mono text-xs">{ubicacionId}</span>). Descargá la hoja de control
              para conteo físico y confirmá el ingreso a stock local.
            </p>
          </div>
          <Link
            to="/campamento/inventario"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50"
          >
            <Database className="h-4 w-4" aria-hidden />
            Inventario local
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-[#8997A6]">
              {pendientes.length.toLocaleString('es-AR')} remito
              {pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6] shadow-sm">
                <tr>
                  <th className="px-4 py-3">Fecha envío</th>
                  <th className="px-4 py-3">Remito</th>
                  <th className="px-4 py-3">Destino (texto)</th>
                  <th className="px-4 py-3 text-right">Ítems</th>
                  <th className="px-4 py-3">Transporte</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-[#8997A6]">
                      No hay traslados pendientes de recepción para tu sucursal.
                    </td>
                  </tr>
                ) : (
                  pendientes.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-[#171717]">{formatFecha(m.fecha)}</td>
                      <td className="px-4 py-3 font-medium text-[#171717]">{m.numeroDocumento}</td>
                      <td className="px-4 py-3 text-[#171717]">{m.destino}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                        {m.items.length}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8997A6]">
                        {m.transporte
                          ? `${m.transporte.patente} · ${m.transporte.chofer}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => abrirPanel(m)}
                          className="rounded-lg bg-[#CD1818] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
                        >
                          Recibir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {egresoSeleccionado ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-gray-50"
          role="dialog"
          aria-modal
          aria-labelledby="panel-recepcion-titulo"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6">
            <div className="min-w-0">
              <h2 id="panel-recepcion-titulo" className="text-lg font-semibold text-[#CD1818]">
                Recepción — remito {egresoSeleccionado.numeroDocumento}
              </h2>
              <p className="mt-1 text-xs text-[#8997A6]">
                {egresoSeleccionado.items.length.toLocaleString('es-AR')} ítems · Usá la hoja de
                control en depósito físico y registrá diferencias solo donde corresponda.
              </p>
            </div>
            <button
              type="button"
              onClick={cerrarPanel}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[#171717] transition hover:bg-gray-50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={handleDescargarPdf}
                className="rounded-lg bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Descargar Hoja de Control (PDF)
              </button>
              <button
                type="button"
                onClick={marcarTodoRecibido}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#171717] transition hover:bg-gray-50"
              >
                Marcar todo como recibido
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-[#171717]">
                <input
                  type="checkbox"
                  checked={soloDiferencias}
                  onChange={(e) => setSoloDiferencias(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#CD1818]"
                />
                Ver solo ítems con diferencia
              </label>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
              <p className="font-semibold text-[#CD1818]">Confirmación requerida</p>
              <p className="mt-1 text-amber-900/90">
                Para habilitar <strong>Confirmar ingreso a stock</strong> tenés que{' '}
                <strong>descargar la hoja de control (PDF)</strong> o marcar la declaración abajo.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={declaracionConformidad}
                  onChange={(e) => setDeclaracionConformidad(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#CD1818]"
                />
                <span>
                  Declaro conformidad sin hoja impresa (asumo responsabilidad del conteo y
                  acepto registrar el ingreso con las cantidades indicadas en pantalla).
                </span>
              </label>
              {hojaPdfDescargada ? (
                <p className="mt-2 text-xs font-medium text-green-800">
                  PDF de control generado en esta sesión.
                </p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="max-h-[min(70vh,calc(100dvh-22rem))] overflow-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6] shadow-sm">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Insumo</th>
                      <th className="px-3 py-3">Unidad</th>
                      <th className="px-3 py-3">Lote</th>
                      <th className="px-3 py-3">Vencimiento</th>
                      <th className="px-3 py-3 text-right">Enviado</th>
                      <th className="px-3 py-3 text-right">Recibido</th>
                      <th className="px-3 py-3">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {indicesVisibles.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-[#8997A6]">
                          {soloDiferencias
                            ? 'No hay ítems con diferencia entre enviado y recibido.'
                            : 'Sin ítems.'}
                        </td>
                      </tr>
                    ) : (
                      indicesVisibles.map((index) => {
                        const orig = egresoSeleccionado.items[index]
                        const row = itemsRecibidos[index]
                        const recibido = row?.cantidad ?? 0
                        const invalid =
                          recibido > orig.cantidad + 1e-9 || recibido < 0
                        const tieneDiff = Math.abs(recibido - orig.cantidad) > 1e-9
                        const puedeEditar = filaEdicionDiferencia[index] === true
                        const unidad = unidadPorInsumoId.get(orig.insumoId) ?? '—'

                        return (
                          <tr
                            key={`${orig.insumoId}-${index}`}
                            className={tieneDiff ? 'bg-amber-50/50' : undefined}
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-[#8997A6]">
                              {index + 1}
                            </td>
                            <td className="max-w-[280px] px-3 py-2">
                              <p className="font-medium text-[#171717]">{orig.nombreSnapshot}</p>
                              <p className="text-xs text-[#8997A6]">{orig.insumoId}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-[#171717]">
                              {unidad}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#171717]">
                              {orig.lote?.trim() || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[#171717]">
                              {formatFechaVencimiento(orig.fechaVencimiento)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-[#171717]">
                              {orig.cantidad.toLocaleString('es-AR', {
                                maximumFractionDigits: 4,
                              })}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {puedeEditar ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={orig.cantidad}
                                  step="any"
                                  value={Number.isFinite(recibido) ? String(recibido) : '0'}
                                  onChange={(e) =>
                                    actualizarCantidadRecibida(index, e.target.value)
                                  }
                                  className={`ml-auto block w-28 rounded-lg border px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-[#CD1818]/20 ${
                                    invalid ? 'border-red-400' : 'border-gray-200'
                                  }`}
                                />
                              ) : (
                                <span className="inline-block min-w-[5rem] text-right tabular-nums font-semibold text-[#171717]">
                                  {recibido.toLocaleString('es-AR', {
                                    maximumFractionDigits: 4,
                                  })}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {puedeEditar ? (
                                <button
                                  type="button"
                                  onClick={() => desactivarEdicionDiferencia(index)}
                                  className="text-xs font-semibold text-[#CD1818] underline-offset-2 hover:underline"
                                >
                                  Igualar a enviado
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => activarEdicionDiferencia(index)}
                                  className="text-xs font-semibold text-[#CD1818] underline-offset-2 hover:underline"
                                >
                                  Indicar diferencia
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-200 bg-white/90 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
              <button
                type="button"
                onClick={cerrarPanel}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-[#171717] transition hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando || !puedeConfirmarIngreso}
                onClick={() => void handleConfirmarIngreso()}
                className="rounded-lg bg-[#CD1818] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {guardando ? 'Guardando…' : 'Confirmar ingreso a stock'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
