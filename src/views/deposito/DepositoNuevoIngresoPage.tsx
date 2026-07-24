import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ModoPistolaBarra } from '../../components/deposito/ModoPistolaBarra'
import { InsumoSearchSelect } from '../../components/insumos/InsumoSearchSelect'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatLabelInsumo, subscribeInsumos, type Insumo } from '../../lib/insumos'
import { buscarInsumoPorCodigoEscaneado } from '../../lib/codigoBarrasInsumo'
import {
  useInventarioScanner,
  type EscaneoInventario,
} from '../../hooks/useInventarioScanner'
import { crearMovimiento, type TipoDocumentoRecepcion } from '../../lib/movimientosInventario'
import { parseNumeroInput } from '../../lib/comprasUi'

/*
 * Modo ingreso desde Orden de Compra (desacoplado por ahora):
 * - ProveedorSearchSelect / subscribeProveedoresPadron
 * - subscribeOrdenesCompra + registrarRecepcionOcEnIngreso
 * - ComprobanteUploadField + subirDocumentoAdjunto al expediente de la OC
 * Reactivar cuando vuelva el circuito de compras/tesorería.
 */

type FilaIngreso = {
  key: string
  insumoId: string | null
  nombreSnapshot: string
  unidadBase: string
  cantidad: string
  lote: string
  fechaVencimiento: string
}

function hoyISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseFechaLocal(yyyyMmDd: string): Date {
  const [y, mo, da] = yyyyMmDd.split('-').map(Number)
  if (!y || !mo || !da) return new Date()
  return new Date(y, mo - 1, da, 12, 0, 0, 0)
}

function nuevaFilaLibre(): FilaIngreso {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: null,
    nombreSnapshot: '',
    unidadBase: '',
    cantidad: '',
    lote: '',
    fechaVencimiento: '',
  }
}

const inputClass =
  'mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/10'

const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-neutral-500'

export function DepositoNuevoIngresoPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)

  const [proveedorNombre, setProveedorNombre] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoRecepcion>('Remito')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [fechaOperacion, setFechaOperacion] = useState(hoyISO)
  const [filas, setFilas] = useState<FilaIngreso[]>([nuevaFilaLibre()])
  const [modoPistola, setModoPistola] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const cantidadInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const registerCantidadRef = useCallback((key: string) => {
    return (el: HTMLInputElement | null) => {
      if (el) cantidadInputRefs.current[key] = el
      else delete cantidadInputRefs.current[key]
    }
  }, [])

  const enfocarCantidadFila = useCallback((filaKey: string) => {
    queueMicrotask(() => {
      const el = cantidadInputRefs.current[filaKey]
      el?.focus()
      el?.select()
    })
  }, [])

  useEffect(() => {
    setCargando(true)
    const unsub = subscribeInsumos((rows) => {
      setInsumos(rows)
      setCargando(false)
    })
    return () => unsub()
  }, [])

  function actualizarFila(index: number, parcial: Partial<FilaIngreso>) {
    setFilas((prev) => prev.map((f, i) => (i === index ? { ...f, ...parcial } : f)))
  }

  function agregarFilaLibre() {
    setFilas((prev) => [...prev, nuevaFilaLibre()])
  }

  function quitarFila(index: number) {
    setFilas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const aplicarEscaneoIngreso = useCallback(
    (ins: Insumo) => {
      let filaKeyUsada = ''
      setFilas((prev) => {
        let targetIdx = prev.findIndex(
          (f) => f.insumoId === ins.id && !f.cantidad.trim(),
        )
        if (targetIdx < 0) {
          targetIdx = prev.findIndex((f) => !f.insumoId?.trim())
        }

        const parcial: Partial<FilaIngreso> = {
          insumoId: ins.id,
          nombreSnapshot: formatLabelInsumo(ins),
          unidadBase: ins.unidadBase,
        }

        if (targetIdx >= 0) {
          filaKeyUsada = prev[targetIdx].key
          return prev.map((f, i) => (i === targetIdx ? { ...f, ...parcial } : f))
        }

        const nueva: FilaIngreso = { ...nuevaFilaLibre(), ...parcial }
        filaKeyUsada = nueva.key
        return [...prev, nueva]
      })

      if (filaKeyUsada) enfocarCantidadFila(filaKeyUsada)
      showToast(`${formatLabelInsumo(ins)} — completá cantidad, lote y vencimiento`, 'success')
    },
    [showToast, enfocarCantidadFila],
  )

  const handleEscaneoInventario = useCallback(
    (result: EscaneoInventario) => {
      if (result.tipo === 'vianda_qr' || result.tipo === 'vianda_codigo') {
        showToast('En ingreso usá el EAN del insumo del proveedor.', 'error')
        return
      }

      if (result.tipo === 'qr_insumo') {
        showToast('En ingreso usá el EAN del envase. Las etiquetas QR internas son para egresos.', 'error')
        return
      }

      if (result.tipo === 'codigo_barras_insumo') {
        const ins = buscarInsumoPorCodigoEscaneado(insumos, result.codigo)
        if (!ins) {
          showToast(
            `Código ${result.codigo} no registrado. Cargalo en Catálogo de insumos.`,
            'error',
          )
          return
        }
        aplicarEscaneoIngreso(ins)
      }
    },
    [insumos, aplicarEscaneoIngreso, showToast],
  )

  useInventarioScanner({
    enabled: modoPistola && !guardando && !cargando,
    aceptarViandas: false,
    onScan: handleEscaneoInventario,
  })

  const filasValidas = useMemo(() => {
    return filas.filter((f) => {
      const cant = parseNumeroInput(f.cantidad)
      if (cant == null || cant <= 0) return false
      if (!f.insumoId?.trim()) return false
      if (!f.lote.trim()) return false
      if (!f.fechaVencimiento.trim()) return false
      return true
    })
  }, [filas])

  const cabeceraValida = useMemo(() => {
    return Boolean(
      numeroDocumento.trim() &&
        fechaOperacion.trim() &&
        proveedorNombre.trim(),
    )
  }, [numeroDocumento, fechaOperacion, proveedorNombre])

  const puedeConfirmar = cabeceraValida && filasValidas.length > 0 && !guardando

  async function handleConfirmar() {
    if (!user || !puedeConfirmar) return
    setGuardando(true)
    try {
      const fecha = parseFechaLocal(fechaOperacion)
      await crearMovimiento({
        tipo: 'INGRESO',
        fecha,
        proveedor: proveedorNombre.trim(),
        tipoDocumento,
        numeroDocumento: numeroDocumento.trim(),
        items: filasValidas.map((f) => ({
          insumoId: f.insumoId!,
          nombreSnapshot: f.nombreSnapshot,
          cantidad: parseNumeroInput(f.cantidad)!,
          lote: f.lote.trim(),
          fechaVencimiento: f.fechaVencimiento.trim(),
          controlCalidadOk: true,
        })),
      })
      showToast('Ingreso registrado correctamente.', 'success')
      navigate('/deposito/movimientos', { replace: true })
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo registrar el ingreso.',
        'error',
      )
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-neutral-50 py-24 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
        <p className="text-sm">Cargando datos…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <Link
          to="/deposito/movimientos"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#CD1818] transition hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a movimientos
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-[#CD1818]">
          Nuevo ingreso de mercadería
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Completá el comprobante y la grilla de artículos. El ingreso actualiza el stock del
          depósito.
        </p>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Datos del comprobante
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClass} htmlFor="proveedor-nombre">
                  Proveedor
                </label>
                <input
                  id="proveedor-nombre"
                  type="text"
                  required
                  className={inputClass}
                  placeholder="Nombre del proveedor"
                  value={proveedorNombre}
                  onChange={(e) => setProveedorNombre(e.target.value)}
                  autoComplete="organization"
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="fecha-op">
                  Fecha del ingreso
                </label>
                <input
                  id="fecha-op"
                  type="date"
                  className={inputClass}
                  value={fechaOperacion}
                  onChange={(e) => setFechaOperacion(e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="tipo-doc">
                  Tipo de comprobante
                </label>
                <select
                  id="tipo-doc"
                  className={inputClass}
                  value={tipoDocumento}
                  onChange={(e) =>
                    setTipoDocumento(e.target.value as TipoDocumentoRecepcion)
                  }
                >
                  <option value="Remito">Remito</option>
                  <option value="Factura">Factura</option>
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="num-doc">
                  Número de comprobante
                </label>
                <input
                  id="num-doc"
                  type="text"
                  required
                  className={inputClass}
                  placeholder="Ej. R-00012345"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Artículos
              </h2>
              <button
                type="button"
                onClick={agregarFilaLibre}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-neutral-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Agregar ítem
              </button>
            </div>

            <div className="mt-4">
              <ModoPistolaBarra
                activo={modoPistola}
                onToggle={() => setModoPistola((v) => !v)}
                disabled={guardando}
                hint="Escaneá el EAN del envase para agregar el insumo. Completá cantidad, lote y vencimiento."
              />
            </div>

            {filas.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">No hay ítems para ingresar.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-2.5 pr-3 font-semibold">Artículo / Insumo</th>
                      <th className="w-28 py-2.5 pr-3 font-semibold">Cantidad</th>
                      <th className="w-36 py-2.5 pr-3 font-semibold">Lote</th>
                      <th className="w-40 py-2.5 pr-3 font-semibold">Vencimiento</th>
                      <th className="w-12 py-2.5" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filas.map((fila, idx) => (
                      <tr key={fila.key} className="align-top">
                        <td className="py-3 pr-3">
                          <InsumoSearchSelect
                            insumos={insumos}
                            selectedId={fila.insumoId}
                            selectedLabel={fila.nombreSnapshot}
                            compact
                            hideLabelOnDesktop
                            placeholder="Buscar insumo…"
                            onSelect={(ins) =>
                              actualizarFila(idx, {
                                insumoId: ins.id,
                                nombreSnapshot: formatLabelInsumo(ins),
                                unidadBase: ins.unidadBase,
                              })
                            }
                            onClear={() =>
                              actualizarFila(idx, {
                                insumoId: null,
                                nombreSnapshot: '',
                                unidadBase: '',
                              })
                            }
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            ref={registerCantidadRef(fila.key)}
                            type="number"
                            min="0"
                            step="any"
                            className={inputClass}
                            value={fila.cantidad}
                            onChange={(e) => actualizarFila(idx, { cantidad: e.target.value })}
                          />
                          {fila.unidadBase ? (
                            <p className="mt-0.5 text-[11px] text-neutral-500">{fila.unidadBase}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="text"
                            required
                            className={inputClass}
                            placeholder="Obligatorio"
                            value={fila.lote}
                            onChange={(e) => actualizarFila(idx, { lote: e.target.value })}
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="date"
                            required
                            className={inputClass}
                            value={fila.fechaVencimiento}
                            onChange={(e) =>
                              actualizarFila(idx, { fechaVencimiento: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            disabled={filas.length <= 1}
                            onClick={() => quitarFila(idx)}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                            aria-label="Quitar fila"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-3 pb-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-500">
              {filasValidas.length}{' '}
              {filasValidas.length === 1 ? 'ítem listo' : 'ítems listos'} para confirmar
              {filasValidas.length < filas.length && filas.length > 0
                ? ' (completá lote, vencimiento y cantidad en cada fila)'
                : ''}
            </p>
            <button
              type="button"
              disabled={!puedeConfirmar}
              onClick={() => void handleConfirmar()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-8 text-base font-semibold text-white shadow-sm transition hover:bg-[#b01515] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {guardando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                'Confirmar ingreso'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
