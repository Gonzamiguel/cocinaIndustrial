import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InsumoSearchSelect } from '../insumos/InsumoSearchSelect'
import { useToast } from '../../context/ToastContext'
import { UBICACION_DEPOSITO_CENTRAL } from '../../lib/movimientosInventario'
import { formatLabelInsumo, type Insumo } from '../../lib/insumos'
import { hoyYmdLocal, parseNumeroInput } from '../../lib/comprasUi'
import {
  crearRequisicionCompraInterna,
  type PrioridadSolicitud,
} from '../../lib/solicitudesMercaderia'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from '../tesoreria/TesoreriaFormModal'

type LineaDraft = {
  key: string
  insumoId: string | null
  nombreSnapshot: string
  unidadMedida: string
  presentacion: string
  cantidad: string
  observacion: string
}

function nuevaLinea(): LineaDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: null,
    nombreSnapshot: '',
    unidadMedida: '',
    presentacion: '',
    cantidad: '',
    observacion: '',
  }
}

export type NuevaRequisicionCompraModalProps = {
  open: boolean
  onClose: () => void
  insumos: Insumo[]
}

export function NuevaRequisicionCompraModal({
  open,
  onClose,
  insumos,
}: NuevaRequisicionCompraModalProps) {
  const { showToast } = useToast()
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>('Normal')
  const [lineas, setLineas] = useState<LineaDraft[]>([nuevaLinea()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFechaEntrega('')
    setPrioridad('Normal')
    setLineas([nuevaLinea()])
  }, [open])

  const lineasValidas = lineas.filter(
    (l) => l.insumoId && l.nombreSnapshot.trim() && parseNumeroInput(l.cantidad) > 0,
  )
  const formValid = fechaEntrega && lineasValidas.length > 0

  function actualizarLinea(key: string, patch: Partial<LineaDraft>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    if (!formValid) return
    setSaving(true)
    try {
      await crearRequisicionCompraInterna({
        fechaEntregaEsperada: fechaEntrega,
        prioridad,
        ubicacionSolicitanteId: UBICACION_DEPOSITO_CENTRAL,
        items: lineasValidas.map((l) => ({
          insumoId: l.insumoId!,
          producto: l.nombreSnapshot.trim(),
          cantidad: parseNumeroInput(l.cantidad),
          unidadMedida: l.unidadMedida.trim() || '—',
          presentacion: l.presentacion.trim() || '—',
          observacion: l.observacion.trim(),
        })),
      })
      showToast('Requisición enviada al área de Compras.', 'success')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la requisición.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TesoreriaFormModal
      open={open}
      title="Nueva requisición de compra"
      subtitle="Pedido interno al área de Compras/Gerencia. No genera OC ni compromete proveedor."
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel="Enviar requisición"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="req-entrega">
              Fecha de entrega necesaria
            </label>
            <input
              id="req-entrega"
              type="date"
              min={hoyYmdLocal()}
              className={inputClass}
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="req-prioridad">
              Prioridad
            </label>
            <select
              id="req-prioridad"
              className={inputClass}
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as PrioridadSolicitud)}
            >
              <option value="Normal">Normal</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
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
                      className="rounded p-1 text-neutral-400 hover:text-red-600"
                      aria-label="Quitar línea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_100px]">
                  <InsumoSearchSelect
                    insumos={insumos}
                    selectedId={linea.insumoId}
                    selectedLabel={linea.nombreSnapshot}
                    compact
                    onSelect={(insumo) =>
                      actualizarLinea(linea.key, {
                        insumoId: insumo.id,
                        nombreSnapshot: formatLabelInsumo(insumo),
                        unidadMedida: insumo.unidadBase,
                        presentacion: insumo.presentacion,
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TesoreriaFormModal>
  )
}
