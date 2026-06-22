import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { registrarRecepcionOcEnIngreso } from '../../lib/ordenesCompra'
import { mensajeErrorCompras, parseNumeroInput } from '../../lib/comprasUi'
import { nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { OrdenCompra } from '../../types/compras'
import type { TipoDocumentoRecepcion } from '../../lib/movimientosInventario'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from '../tesoreria/TesoreriaFormModal'

export type RecepcionOcModalProps = {
  open: boolean
  orden: OrdenCompra | null
  onClose: () => void
}

export function RecepcionOcModal({ open, orden, onClose }: RecepcionOcModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoRecepcion>('Remito')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [lotes, setLotes] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !orden) return
    setTipoDocumento('Remito')
    setNumeroDocumento('')
    const qty: Record<string, string> = {}
    const lot: Record<string, string> = {}
    for (const it of orden.items) {
      if (it.estadoLinea !== 'CANCELADA' && it.cantidadPendiente > 0) {
        qty[it.lineaId] = String(it.cantidadPendiente)
        lot[it.lineaId] = ''
      }
    }
    setCantidades(qty)
    setLotes(lot)
  }, [open, orden])

  if (!orden) return null

  const lineasPendientes = orden.items.filter(
    (it) => it.estadoLinea !== 'CANCELADA' && it.cantidadPendiente > 0,
  )

  const lineasRecepcion = lineasPendientes
    .map((it) => ({
      linea: it,
      cantidad: parseNumeroInput(cantidades[it.lineaId] ?? '0'),
    }))
    .filter((x) => x.cantidad > 0)

  const formValid =
    numeroDocumento.trim() &&
    lineasRecepcion.length > 0 &&
    lineasRecepcion.every((x) => x.cantidad <= x.linea.cantidadPendiente + 0.000001)

  async function handleSave() {
    if (!user || !formValid || !orden) return
    setSaving(true)
    try {
      const result = await registrarRecepcionOcEnIngreso({
        ordenCompraId: orden.id,
        fecha: new Date(),
        tipoDocumento,
        numeroDocumento: numeroDocumento.trim(),
        lineas: lineasRecepcion.map(({ linea, cantidad }) => ({
          lineaId: linea.lineaId,
          insumoId: linea.insumoId,
          cantidadRecibida: cantidad,
          lote: lotes[linea.lineaId]?.trim() || undefined,
          controlCalidadOk: true,
        })),
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(
        `Recepción registrada. OC ${result.ordenCompraNumero} → ${result.ordenCompraEstado.replace(/_/g, ' ')}.`,
        'success',
      )
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
      title={`Recibir mercadería — ${orden.numero}`}
      subtitle="Genera un ingreso en depósito vinculado a esta orden de compra."
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel="Registrar recepción"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="rec-tipo">
              Tipo documento
            </label>
            <select
              id="rec-tipo"
              className={inputClass}
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value as TipoDocumentoRecepcion)}
            >
              <option value="Remito">Remito</option>
              <option value="Factura">Factura</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="rec-num">
              Nº documento
            </label>
            <input
              id="rec-num"
              type="text"
              className={inputClass}
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value)}
              placeholder="Ej. R-00012345"
            />
          </div>
        </div>

        {lineasPendientes.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay cantidades pendientes en esta OC.</p>
        ) : (
          <ul className="space-y-2">
            {lineasPendientes.map((it) => (
              <li
                key={it.lineaId}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
              >
                <p className="text-sm font-medium text-neutral-900">{it.nombreSnapshot}</p>
                <p className="text-xs text-neutral-500">
                  Pendiente: {it.cantidadPendiente} {it.unidadBase}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Cantidad a recibir</label>
                    <input
                      type="number"
                      min="0"
                      max={it.cantidadPendiente}
                      step="any"
                      className={inputClass}
                      value={cantidades[it.lineaId] ?? ''}
                      onChange={(e) =>
                        setCantidades((prev) => ({ ...prev, [it.lineaId]: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Lote (opcional)</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={lotes[it.lineaId] ?? ''}
                      onChange={(e) =>
                        setLotes((prev) => ({ ...prev, [it.lineaId]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TesoreriaFormModal>
  )
}
