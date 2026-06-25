import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Loader2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { exportarHojaControlRecepcionPdf } from '../../lib/campamentoRecepcionPdf'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  confirmarRecepcionTrasladoCampamento,
  rechazarRecepcionTrasladoCampamento,
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

export type RecepcionTrasladoContenidoProps = {
  ubicacionId: string
  tituloUbicacion: string
  /** Si se informa, se muestra enlace a inventario local arriba de la tabla. */
  inventarioHref?: string
  /** Dentro de pestaña admin: menos cromo y sin tarjeta anidada extra. */
  embedded?: boolean
}

export function RecepcionTrasladoContenido({
  ubicacionId,
  tituloUbicacion,
  inventarioHref,
  embedded = false,
}: RecepcionTrasladoContenidoProps) {
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [pendientes, setPendientes] = useState<MovimientoEgresoTraslado[]>([])
  const [egresoSeleccionado, setEgresoSeleccionado] = useState<MovimientoEgresoTraslado | null>(
    null,
  )
  const [itemsRecibidos, setItemsRecibidos] = useState<ItemMovimientoInventario[]>([])
  const [filaEdicionDiferencia, setFilaEdicionDiferencia] = useState<boolean[]>([])
  const [hojaPdfDescargada, setHojaPdfDescargada] = useState(false)
  const [declaracionConformidad, setDeclaracionConformidad] = useState(false)
  const [soloDiferencias, setSoloDiferencias] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirmRecepcionAbierta, setConfirmRecepcionAbierta] = useState(false)
  const [confirmRechazoAbierta, setConfirmRechazoAbierta] = useState(false)
  const [observacionesRecepcion, setObservacionesRecepcion] = useState('')
  const [motivoRechazo, setMotivoRechazo] = useState('')

  useEffect(() => subscribeInsumos(setInsumos), [])

  useEffect(() => {
    const ub = ubicacionId.trim().toUpperCase()
    if (!ub) return
    return subscribeTrasladosPendientesRecepcion(ub, setPendientes)
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
    setObservacionesRecepcion('')
    setMotivoRechazo('')
  }, [])

  const cerrarPanel = useCallback(() => {
    setEgresoSeleccionado(null)
    setItemsRecibidos([])
    setFilaEdicionDiferencia([])
    setHojaPdfDescargada(false)
    setDeclaracionConformidad(false)
    setSoloDiferencias(false)
    setConfirmRecepcionAbierta(false)
    setConfirmRechazoAbierta(false)
    setObservacionesRecepcion('')
    setMotivoRechazo('')
  }, [])

  useEffect(() => {
    if (!egresoSeleccionado) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrarPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [egresoSeleccionado, cerrarPanel])

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
    setFilaEdicionDiferencia((prev) => prev.map((v, i) => (i === index ? true : v)))
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
    const ub = ubicacionId.trim().toUpperCase()
    if (!egresoSeleccionado || !ub || !puedeConfirmarIngreso) return
    setGuardando(true)
    try {
      await confirmarRecepcionTrasladoCampamento({
        egresoId: egresoSeleccionado.id,
        ubicacionRecepcionId: ub,
        itemsRecibidos,
        observacionesRecepcion,
      })
      showToast('Ingreso a stock local registrado correctamente.', 'success')
      setConfirmRecepcionAbierta(false)
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

  async function handleRechazarRemito() {
    const ub = ubicacionId.trim().toUpperCase()
    if (!egresoSeleccionado || !ub) return
    const motivo = motivoRechazo.trim()
    if (!motivo) {
      showToast('Indicá el motivo del rechazo.', 'error')
      return
    }
    setGuardando(true)
    try {
      await rechazarRecepcionTrasladoCampamento({
        egresoId: egresoSeleccionado.id,
        ubicacionRecepcionId: ub,
        motivoRechazo: motivo,
      })
      showToast(
        'Remito rechazado. El stock volvió al depósito y el pedido quedó como Rechazado.',
        'success',
      )
      setConfirmRechazoAbierta(false)
      cerrarPanel()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo rechazar el remito.',
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

  const ubDisplay = ubicacionId.trim().toUpperCase()

  return (
    <>
      <ConfirmDialog
        open={confirmRechazoAbierta}
        title="Rechazar remito del depósito"
        description={
          egresoSeleccionado
            ? `¿Rechazás el remito ${egresoSeleccionado.numeroDocumento}? La mercadería no ingresará a tu stock; el depósito recuperará las cantidades enviadas.`
            : ''
        }
        confirmLabel="Sí, rechazar remito"
        cancelLabel="Volver"
        isWorking={guardando}
        onCancel={() => {
          if (!guardando) setConfirmRechazoAbierta(false)
        }}
        onConfirm={() => void handleRechazarRemito()}
      />
      <ConfirmDialog
        open={confirmRecepcionAbierta}
        title="Confirmar recepción del traslado"
        description={
          egresoSeleccionado
            ? `¿Estás seguro de confirmar la recepción del remito ${egresoSeleccionado.numeroDocumento}? Esta acción actualizará tu stock local en ${tituloUbicacion} y no se puede deshacer.`
            : ''
        }
        confirmLabel="Sí, confirmar recepción"
        cancelLabel="Cancelar"
        isWorking={guardando}
        onCancel={() => {
          if (!guardando) setConfirmRecepcionAbierta(false)
        }}
        onConfirm={() => void handleConfirmarIngreso()}
      />
      {!embedded && inventarioHref ? (
        <div className="mb-4 flex justify-end">
          <Link
            to={inventarioHref}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50"
          >
            <Database className="h-4 w-4" aria-hidden />
            Inventario local
          </Link>
        </div>
      ) : null}

      <section
        className={
          embedded
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'
        }
      >
        <div
          className={
            embedded
              ? 'shrink-0 border-b border-neutral-100 px-3 py-2'
              : 'border-b border-gray-100 px-5 py-4'
          }
        >
          {embedded ? (
            <p className="text-xs text-[#8997A6]">
              {tituloUbicacion} · <span className="font-mono text-[11px] text-[#171717]">{ubDisplay}</span>
              {' · '}
              {pendientes.length.toLocaleString('es-AR')} remito
              {pendientes.length === 1 ? '' : 's'} del depósito por revisar
            </p>
          ) : (
            <>
              <p className="text-xs text-[#8997A6]">
                Traslados hacia <span className="font-medium text-[#171717]">{tituloUbicacion}</span>{' '}
                (<span className="font-mono text-xs">{ubDisplay}</span>)
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#8997A6]">
                {pendientes.length.toLocaleString('es-AR')} remito
                {pendientes.length === 1 ? '' : 's'} del depósito por revisar
              </p>
            </>
          )}
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
                    No hay remitos del depósito pendientes de revisión para tu sucursal.
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
                        Revisar remito
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                {egresoSeleccionado.items.length.toLocaleString('es-AR')} ítems enviados por el
                depósito. Revisá cantidades, indicá diferencias si hace falta y confirmá para que
                ingresen a tu stock local, o rechazá el remito si no corresponde recibirlo.
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
                  Declaro conformidad sin hoja impresa (asumo responsabilidad del conteo y acepto
                  registrar el ingreso con las cantidades indicadas en pantalla).
                </span>
              </label>
              {hojaPdfDescargada ? (
                <p className="mt-2 text-xs font-medium text-green-800">
                  PDF de control generado en esta sesión.
                </p>
              ) : null}
            </div>

            <label className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#8997A6]">
                Observaciones de recepción <span className="font-normal">(opcional)</span>
              </span>
              <textarea
                value={observacionesRecepcion}
                onChange={(e) => setObservacionesRecepcion(e.target.value)}
                rows={2}
                placeholder='Ej. "Faltó 1 kg de tomate, el resto OK"'
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>

            <label className="block rounded-xl border border-red-100 bg-red-50/40 p-4 shadow-sm">
              <span className="text-xs font-semibold text-red-800">Rechazar remito</span>
              <p className="mt-1 text-xs text-red-900/80">
                Si la mercadería no puede ingresar (error total, envío incorrecto, etc.), indicá el
                motivo. El stock vuelve al depósito y el pedido queda como Rechazado.
              </p>
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                rows={2}
                placeholder="Motivo del rechazo (obligatorio para rechazar)"
                className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-[#171717] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200"
              />
            </label>

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
                        const invalid = recibido > orig.cantidad + 1e-9 || recibido < 0
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
                            <td className="whitespace-nowrap px-3 py-2 text-[#171717]">{unidad}</td>
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
                disabled={guardando || !motivoRechazo.trim()}
                onClick={() => {
                  if (motivoRechazo.trim()) setConfirmRechazoAbierta(true)
                }}
                className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Rechazar remito
              </button>
              <button
                type="button"
                disabled={guardando || !puedeConfirmarIngreso}
                onClick={() => {
                  if (puedeConfirmarIngreso) setConfirmRecepcionAbierta(true)
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#CD1818] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {guardando ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : (
                  'Confirmar ingreso a stock'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
