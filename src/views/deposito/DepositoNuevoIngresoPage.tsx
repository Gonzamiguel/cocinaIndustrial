import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ComprobanteUploadField } from '../../components/compras/ComprobanteUploadField'
import { InsumoSearchSelect } from '../../components/insumos/InsumoSearchSelect'
import { ProveedorSearchSelect } from '../../components/compras/ProveedorSearchSelect'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  mensajeErrorDocumento,
  subirDocumentoAdjunto,
} from '../../lib/documentos'
import { formatLabelInsumo, subscribeInsumos, type Insumo } from '../../lib/insumos'
import { crearMovimiento, type TipoDocumentoRecepcion } from '../../lib/movimientosInventario'
import {
  mensajeErrorCompras,
  parseNumeroInput,
} from '../../lib/comprasUi'
import {
  registrarRecepcionOcEnIngreso,
} from '../../lib/ordenesCompra'
import {
  subscribeProveedoresPadron,
  type ProveedorPadron,
} from '../../lib/proveedoresPadron'
import { subscribeOrdenesCompra } from '../../lib/tesoreriaQueries'
import { nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { OrdenCompra, OrdenCompraLinea } from '../../types/compras'

type ModoIngreso = 'oc' | 'libre'

type FilaIngreso = {
  key: string
  lineaId?: string
  insumoId: string | null
  nombreSnapshot: string
  unidadBase: string
  cantidadPendiente?: number
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

function filaDesdeLineaOc(linea: OrdenCompraLinea): FilaIngreso {
  return {
    key: linea.lineaId,
    lineaId: linea.lineaId,
    insumoId: linea.insumoId,
    nombreSnapshot: linea.nombreSnapshot,
    unidadBase: linea.unidadBase,
    cantidadPendiente: linea.cantidadPendiente,
    cantidad: String(linea.cantidadPendiente),
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
  const [proveedores, setProveedores] = useState<ProveedorPadron[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [cargando, setCargando] = useState(true)

  const [modo, setModo] = useState<ModoIngreso>('oc')
  const [ordenCompraId, setOrdenCompraId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoRecepcion>('Remito')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [fechaOperacion, setFechaOperacion] = useState(hoyISO)
  const [filas, setFilas] = useState<FilaIngreso[]>([])
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let pending = 3
    const done = () => {
      pending -= 1
      if (pending <= 0) setCargando(false)
    }
    setCargando(true)
    const unsubs = [
      subscribeInsumos((rows) => {
        setInsumos(rows)
        done()
      }),
      subscribeProveedoresPadron((rows) => {
        setProveedores(rows.filter((p) => p.proveedorActivo))
        done()
      }),
      subscribeOrdenesCompra((rows) => {
        setOrdenes(rows)
        done()
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const ocsRecepcion = useMemo(
    () =>
      ordenes.filter(
        (oc) =>
          (oc.estado === 'APROBADA' || oc.estado === 'RECIBIDA_PARCIAL') &&
          oc.items.some(
            (it) => it.estadoLinea !== 'CANCELADA' && it.cantidadPendiente > 0,
          ),
      ),
    [ordenes],
  )

  const ordenSeleccionada = useMemo(
    () => ocsRecepcion.find((oc) => oc.id === ordenCompraId) ?? null,
    [ocsRecepcion, ordenCompraId],
  )

  const proveedorSeleccionado = useMemo(
    () => proveedores.find((p) => p.id === proveedorId) ?? null,
    [proveedores, proveedorId],
  )

  useEffect(() => {
    if (modo !== 'oc') return
    if (!ordenSeleccionada) {
      setFilas([])
      return
    }
    const pendientes = ordenSeleccionada.items.filter(
      (it) => it.estadoLinea !== 'CANCELADA' && it.cantidadPendiente > 0,
    )
    setFilas(pendientes.map(filaDesdeLineaOc))
  }, [modo, ordenSeleccionada])


  function cambiarModo(nuevo: ModoIngreso) {
    setModo(nuevo)
    setOrdenCompraId('')
    setProveedorId('')
    setNumeroDocumento('')
    setArchivoComprobante(null)
    setFilas(nuevo === 'libre' ? [nuevaFilaLibre()] : [])
  }

  function actualizarFila(index: number, parcial: Partial<FilaIngreso>) {
    setFilas((prev) => prev.map((f, i) => (i === index ? { ...f, ...parcial } : f)))
  }

  function agregarFilaLibre() {
    setFilas((prev) => [...prev, nuevaFilaLibre()])
  }

  function quitarFila(index: number) {
    if (modo === 'oc') return
    setFilas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const filasValidas = useMemo(() => {
    return filas.filter((f) => {
      const cant = parseNumeroInput(f.cantidad)
      if (cant == null || cant <= 0) return false
      if (!f.insumoId?.trim()) return false
      if (!f.lote.trim()) return false
      if (!f.fechaVencimiento.trim()) return false
      if (modo === 'oc' && f.cantidadPendiente != null && cant > f.cantidadPendiente + 0.000001) {
        return false
      }
      return true
    })
  }, [filas, modo])

  const cabeceraValida = useMemo(() => {
    if (!numeroDocumento.trim() || !fechaOperacion.trim()) return false
    if (modo === 'oc') {
      return Boolean(ordenCompraId && archivoComprobante)
    }
    return Boolean(proveedorId)
  }, [modo, numeroDocumento, fechaOperacion, ordenCompraId, proveedorId, archivoComprobante])

  const puedeConfirmar = cabeceraValida && filasValidas.length > 0 && !guardando

  async function handleConfirmar() {
    if (!user || !puedeConfirmar) return
    setGuardando(true)
    try {
      const fecha = parseFechaLocal(fechaOperacion)

      if (modo === 'oc' && ordenSeleccionada) {
        const result = await registrarRecepcionOcEnIngreso({
          ordenCompraId: ordenSeleccionada.id,
          fecha,
          tipoDocumento,
          numeroDocumento: numeroDocumento.trim(),
          lineas: filasValidas.map((f) => ({
            lineaId: f.lineaId!,
            insumoId: f.insumoId!,
            cantidadRecibida: parseNumeroInput(f.cantidad)!,
            lote: f.lote.trim(),
            fechaVencimiento: f.fechaVencimiento.trim(),
            controlCalidadOk: true,
          })),
          usuarioUid: user.uid,
          usuarioNombre: nombreUsuarioFromAuth(user),
        })

        if (archivoComprobante) {
          const tipoComprobante = tipoDocumento === 'Factura' ? 'FACTURA' : 'REMITO'
          try {
            await subirDocumentoAdjunto({
              file: archivoComprobante,
              entidadId: ordenSeleccionada.id,
              entidadTipo: 'ORDEN_COMPRA',
              tipoComprobante,
              ordenCompraId: ordenSeleccionada.id,
              proveedorId: ordenSeleccionada.proveedorId,
              usuario: {
                uid: user.uid,
                nombre: nombreUsuarioFromAuth(user),
              },
            })
          } catch (docErr) {
            showToast(
              `Ingreso registrado, pero no se pudo subir el comprobante: ${mensajeErrorDocumento(docErr)}`,
              'error',
            )
            navigate('/deposito/movimientos', { replace: true })
            return
          }
        }

        showToast(
          `Ingreso confirmado. OC ${result.ordenCompraNumero} → ${result.ordenCompraEstado.replace(/_/g, ' ')}. Comprobante archivado en el expediente.`,
          'success',
        )
      } else {
        const proveedorNombre =
          proveedorSeleccionado?.razonSocial ||
          proveedorSeleccionado?.nombre ||
          ''
        await crearMovimiento({
          tipo: 'INGRESO',
          fecha,
          proveedor: proveedorNombre,
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
        showToast('Ingreso libre registrado correctamente.', 'success')
      }
      navigate('/deposito/movimientos', { replace: true })
    } catch (err) {
      showToast(
        modo === 'oc' ? mensajeErrorCompras(err) : err instanceof Error ? err.message : 'No se pudo registrar el ingreso.',
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
          Completá el comprobante y la grilla de artículos. Un solo paso actualiza stock y, si
          corresponde, la orden de compra.
        </p>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* CABECERA */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Datos del comprobante
            </h2>

            <fieldset className="mt-4 space-y-4 border-0 p-0">
              <legend className="sr-only">Tipo de ingreso</legend>
              <div className="flex flex-wrap gap-3">
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    modo === 'oc'
                      ? 'border-[#CD1818] bg-[#CD1818]/5 text-[#CD1818]'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="modo-ingreso"
                    className="accent-[#CD1818]"
                    checked={modo === 'oc'}
                    onChange={() => cambiarModo('oc')}
                  />
                  Ingreso desde Orden de Compra
                </label>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    modo === 'libre'
                      ? 'border-[#CD1818] bg-[#CD1818]/5 text-[#CD1818]'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="modo-ingreso"
                    className="accent-[#CD1818]"
                    checked={modo === 'libre'}
                    onChange={() => cambiarModo('libre')}
                  />
                  Ingreso libre (sin OC)
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {modo === 'oc' ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass} htmlFor="sel-oc">
                      Orden de compra
                    </label>
                    <select
                      id="sel-oc"
                      className={inputClass}
                      value={ordenCompraId}
                      onChange={(e) => {
                        setOrdenCompraId(e.target.value)
                        setArchivoComprobante(null)
                      }}
                    >
                      <option value="">Seleccioná una OC aprobada…</option>
                      {ocsRecepcion.map((oc) => (
                        <option key={oc.id} value={oc.id}>
                          {oc.numero} · {oc.proveedorNombre}
                          {oc.estado === 'RECIBIDA_PARCIAL' ? ' (parcial)' : ''}
                        </option>
                      ))}
                    </select>
                    {ocsRecepcion.length === 0 ? (
                      <p className="mt-1.5 text-xs text-amber-700">
                        No hay OC aprobadas con cantidades pendientes.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass} htmlFor="busq-prov">
                      Proveedor
                    </label>
                    <ProveedorSearchSelect
                      proveedores={proveedores}
                      selectedId={proveedorId || null}
                      onSelect={(p) => setProveedorId(p.id)}
                      onClear={() => setProveedorId('')}
                    />
                  </div>
                )}

                {modo === 'oc' && ordenSeleccionada ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Proveedor (desde OC)</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      className={`${inputClass} cursor-not-allowed bg-neutral-100 text-neutral-700`}
                      value={ordenSeleccionada.proveedorNombre}
                    />
                  </div>
                ) : null}

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

                {modo === 'oc' ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <ComprobanteUploadField
                      label={
                        tipoDocumento === 'Factura'
                          ? 'Foto o PDF de la factura'
                          : 'Foto o PDF del remito'
                      }
                      hint="El archivo queda en el expediente de la OC y en el legajo del proveedor para finanzas."
                      required
                      disabled={guardando || !ordenCompraId}
                      file={archivoComprobante}
                      onFileChange={setArchivoComprobante}
                    />
                  </div>
                ) : null}
              </div>
            </fieldset>
          </section>

          {/* CUERPO — GRILLA */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Artículos
              </h2>
              {modo === 'libre' ? (
                <button
                  type="button"
                  onClick={agregarFilaLibre}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-[#CD1818] transition hover:bg-neutral-50"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Agregar ítem
                </button>
              ) : null}
            </div>

            {modo === 'oc' && !ordenCompraId ? (
              <p className="mt-4 text-sm text-neutral-500">
                Seleccioná una orden de compra para cargar los ítems pendientes.
              </p>
            ) : filas.length === 0 ? (
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
                      {modo === 'oc' ? (
                        <th className="w-24 py-2.5 font-semibold">Pendiente</th>
                      ) : (
                        <th className="w-12 py-2.5" aria-label="Acciones" />
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filas.map((fila, idx) => (
                      <tr key={fila.key} className="align-top">
                        <td className="py-3 pr-3">
                          {modo === 'oc' ? (
                            <div>
                              <p className="font-medium text-neutral-900">{fila.nombreSnapshot}</p>
                              <p className="text-xs text-neutral-500">{fila.unidadBase}</p>
                            </div>
                          ) : (
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
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            max={
                              modo === 'oc' && fila.cantidadPendiente != null
                                ? fila.cantidadPendiente
                                : undefined
                            }
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
                        {modo === 'oc' ? (
                          <td className="py-3 tabular-nums text-neutral-600">
                            {fila.cantidadPendiente ?? '—'}
                          </td>
                        ) : (
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
                        )}
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
