import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { InsumoSearchSelect } from '../insumos/InsumoSearchSelect'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { crearOrdenCompra } from '../../lib/ordenesCompra'
import {
  esRequisicionCompra,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import { esProveedorTesoreria, type ProveedorTesoreria } from '../../lib/tesoreriaQueries'
import {
  hoyYmdLocal,
  mensajeErrorCompras,
  parseNumeroInput,
} from '../../lib/comprasUi'
import { formatLabelInsumo, type Insumo } from '../../lib/insumos'
import { nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import { UBICACION_DEPOSITO_CENTRAL } from '../../lib/movimientosInventario'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from '../tesoreria/TesoreriaFormModal'

type LineaDraft = {
  key: string
  insumoId: string | null
  nombreSnapshot: string
  cantidad: string
  precioUnitario: string
}

function nuevaLinea(): LineaDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: null,
    nombreSnapshot: '',
    cantidad: '',
    precioUnitario: '',
  }
}

export type NuevaOrdenCompraModalProps = {
  open: boolean
  onClose: () => void
  proveedores: ProveedorTesoreria[]
  insumos: Insumo[]
  /** Requisiciones pendientes para vincular opcionalmente al crear la OC. */
  requisicionesPendientes?: SolicitudMercaderia[]
  /** Pre-selección al abrir desde la bandeja de solicitudes. */
  solicitudMercaderiaIdInicial?: string
}

export function NuevaOrdenCompraModal({
  open,
  onClose,
  proveedores,
  insumos,
  requisicionesPendientes = [],
  solicitudMercaderiaIdInicial,
}: NuevaOrdenCompraModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [proveedorId, setProveedorId] = useState('')
  const [solicitudMercaderiaId, setSolicitudMercaderiaId] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [plazoPago, setPlazoPago] = useState('30')
  const [condicionPago, setCondicionPago] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [lineas, setLineas] = useState<LineaDraft[]>([nuevaLinea()])
  const [saving, setSaving] = useState(false)

  const proveedoresOpciones = useMemo(
    () => proveedores.filter(esProveedorTesoreria),
    [proveedores],
  )

  const requisicionesOpciones = useMemo(
    () =>
      requisicionesPendientes.filter(
        (s) => esRequisicionCompra(s) && s.estado === 'Pendiente',
      ),
    [requisicionesPendientes],
  )

  const requisicionSeleccionada = useMemo(
    () => requisicionesOpciones.find((s) => s.id === solicitudMercaderiaId) ?? null,
    [requisicionesOpciones, solicitudMercaderiaId],
  )

  function lineasDesdeRequisicion(req: SolicitudMercaderia): LineaDraft[] {
    return req.items.map((it) => ({
      key:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now() + Math.random()),
      insumoId: it.insumoId ?? null,
      nombreSnapshot: it.producto,
      cantidad: String(it.cantidad),
      precioUnitario: '',
    }))
  }

  useEffect(() => {
    if (!open) return
    setProveedorId('')
    const reqId = solicitudMercaderiaIdInicial?.trim() ?? ''
    setSolicitudMercaderiaId(reqId)
    const req = reqId
      ? requisicionesOpciones.find((s) => s.id === reqId) ?? null
      : null
    setFechaEntrega(req?.fechaEntregaEsperada ?? '')
    setPlazoPago('30')
    setCondicionPago('')
    setObservaciones('')
    setLineas(req && req.items.length > 0 ? lineasDesdeRequisicion(req) : [nuevaLinea()])
  }, [open, solicitudMercaderiaIdInicial, requisicionesOpciones])

  function handleCambioRequisicion(reqId: string) {
    setSolicitudMercaderiaId(reqId)
    const req = requisicionesOpciones.find((s) => s.id === reqId) ?? null
    if (req) {
      setFechaEntrega(req.fechaEntregaEsperada)
      setLineas(req.items.length > 0 ? lineasDesdeRequisicion(req) : [nuevaLinea()])
    }
  }

  const lineasValidas = lineas.filter(
    (l) =>
      l.insumoId &&
      parseNumeroInput(l.cantidad) > 0 &&
      parseNumeroInput(l.precioUnitario) >= 0,
  )

  const formValid = proveedorId && fechaEntrega && lineasValidas.length > 0

  function actualizarLinea(key: string, patch: Partial<LineaDraft>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    if (!user || !formValid) return
    setSaving(true)
    try {
      const plazo = Math.max(0, Math.round(parseNumeroInput(plazoPago)))
      const result = await crearOrdenCompra({
        proveedorId,
        ubicacionDestinoId: UBICACION_DEPOSITO_CENTRAL,
        fechaEntregaEstimada: fechaEntrega,
        plazoPagoDias: plazo,
        condicionPago: condicionPago.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        ...(solicitudMercaderiaId.trim()
          ? { solicitudMercaderiaId: solicitudMercaderiaId.trim() }
          : {}),
        lineas: lineasValidas.map((l) => ({
          insumoId: l.insumoId!,
          cantidadSolicitada: parseNumeroInput(l.cantidad),
          precioUnitario: parseNumeroInput(l.precioUnitario),
        })),
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(`OC ${result.numero} emitida. Depósito puede recepcionar.`, 'success')
      onClose()
    } catch (err) {
      showToast(mensajeErrorCompras(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TesoreriaFormModal
      open={open}
      title="Nueva orden de compra"
      subtitle="Elegí proveedor, ítems y precios. La OC se emite aprobada y el depósito puede recepcionar."
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel="Emitir OC"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        {requisicionesOpciones.length > 0 ? (
          <div>
            <label className={labelClass} htmlFor="oc-requisicion">
              Vincular requisición interna (opcional)
            </label>
            <select
              id="oc-requisicion"
              className={inputClass}
              value={solicitudMercaderiaId}
              onChange={(e) => handleCambioRequisicion(e.target.value)}
            >
              <option value="">Sin requisición vinculada</option>
              {requisicionesOpciones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ubicacionSolicitanteId ?? 'Solicitante'} · {s.items.length} ítems · entrega{' '}
                  {s.fechaEntregaEsperada}
                  {s.prioridad !== 'Normal' ? ` · ${s.prioridad}` : ''}
                </option>
              ))}
            </select>
            {requisicionSeleccionada ? (
              <p className="mt-1 text-xs text-neutral-500">
                Se precargaron {requisicionSeleccionada.items.length} líneas desde la requisición.
                Podés ajustar cantidades y precios antes de guardar.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="oc-proveedor">
              Proveedor
            </label>
            <select
              id="oc-proveedor"
              className={inputClass}
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
            >
              <option value="">Seleccioná proveedor…</option>
              {proveedoresOpciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.cuit ? ` · ${p.cuit}` : ''}
                </option>
              ))}
            </select>
            {proveedoresOpciones.length === 0 ? (
              <p className="mt-1.5 text-xs text-amber-700">
                No hay proveedores activos.{' '}
                <Link to="/control/proveedores" className="font-semibold underline">
                  Dá de alta un proveedor
                </Link>{' '}
                con razón social y CUIT antes de emitir la OC.
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="oc-entrega">
              Entrega estimada
            </label>
            <input
              id="oc-entrega"
              type="date"
              min={hoyYmdLocal()}
              className={inputClass}
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="oc-plazo">
              Plazo de pago (días)
            </label>
            <input
              id="oc-plazo"
              type="number"
              min="0"
              className={inputClass}
              value={plazoPago}
              onChange={(e) => setPlazoPago(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="oc-condicion">
              Condición de pago (opcional)
            </label>
            <input
              id="oc-condicion"
              type="text"
              placeholder="Ej. 30 días fecha factura"
              className={inputClass}
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800">Ítems solicitados</p>
            <button
              type="button"
              onClick={() => setLineas((prev) => [...prev, nuevaLinea()])}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Agregar línea
            </button>
          </div>

          <ul className="space-y-3">
            {lineas.map((linea, idx) => (
              <li
                key={linea.key}
                className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">Línea {idx + 1}</span>
                  {lineas.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLineas((prev) => prev.filter((l) => l.key !== linea.key))
                      }
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-red-600"
                      aria-label="Quitar línea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px]">
                  <InsumoSearchSelect
                    insumos={insumos}
                    selectedId={linea.insumoId}
                    selectedLabel={linea.nombreSnapshot}
                    compact
                    onSelect={(insumo) =>
                      actualizarLinea(linea.key, {
                        insumoId: insumo.id,
                        nombreSnapshot: formatLabelInsumo(insumo),
                        precioUnitario:
                          linea.precioUnitario ||
                          (insumo.costoEnvase > 0 ? String(insumo.costoEnvase) : ''),
                      })
                    }
                    onClear={() =>
                      actualizarLinea(linea.key, {
                        insumoId: null,
                        nombreSnapshot: '',
                      })
                    }
                  />
                  <div>
                    <label className={labelClass}>Cantidad</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={inputClass}
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(linea.key, { cantidad: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Precio unit.</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClass}
                      value={linea.precioUnitario}
                      onChange={(e) =>
                        actualizarLinea(linea.key, { precioUnitario: e.target.value })
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className={labelClass} htmlFor="oc-obs">
            Observaciones (opcional)
          </label>
          <textarea
            id="oc-obs"
            rows={2}
            className={`${inputClass} min-h-[4rem] resize-y`}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
      </div>
    </TesoreriaFormModal>
  )
}
