import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { registrarOrdenPago } from '../../lib/tesoreria'
import type { ProveedorTesoreria } from '../../lib/tesoreriaQueries'
import {
  formatMonedaArs,
  formatYmdLegible,
  hoyYmdLocal,
  mensajeErrorTesoreria,
  moneyIgual,
  nombreUsuarioFromAuth,
  parseNumeroInput,
  roundMoney,
} from '../../lib/tesoreriaUi'
import type { FacturaProveedor, MetodoPago } from '../../types/tesoreria'
import { EstadoBadge } from './EstadoBadge'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from './TesoreriaFormModal'

const ESTADOS_FACTURA_PAGABLES = new Set(['PENDIENTE_PAGO', 'PAGO_PARCIAL'])
const METODOS: MetodoPago[] = ['TRANSFERENCIA', 'CHEQUE', 'EFECTIVO']

export type NuevaOrdenPagoModalProps = {
  open: boolean
  onClose: () => void
  proveedores: ProveedorTesoreria[]
  facturas: FacturaProveedor[]
}

function distribuirMontoFifo(
  facturas: FacturaProveedor[],
  seleccionadas: Set<string>,
  montoTotal: number,
): Record<string, number> {
  const ordenadas = [...facturas]
    .filter((f) => seleccionadas.has(f.id))
    .sort((a, b) => {
      const cmp = a.fechaVencimiento.localeCompare(b.fechaVencimiento)
      if (cmp !== 0) return cmp
      return a.numeroFactura.localeCompare(b.numeroFactura, 'es')
    })

  let restante = roundMoney(montoTotal)
  const montos: Record<string, number> = {}
  for (const f of ordenadas) {
    if (restante <= 0) {
      montos[f.id] = 0
      continue
    }
    const aplicar = roundMoney(Math.min(f.saldoPendiente, restante))
    montos[f.id] = aplicar
    restante = roundMoney(restante - aplicar)
  }
  return montos
}

export function NuevaOrdenPagoModal({
  open,
  onClose,
  proveedores,
  facturas,
}: NuevaOrdenPagoModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [proveedorId, setProveedorId] = useState('')
  const [fechaPago, setFechaPago] = useState(hoyYmdLocal())
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('TRANSFERENCIA')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [montoTotal, setMontoTotal] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [montosAplicados, setMontosAplicados] = useState<Record<string, number>>({})
  const [distribucionManual, setDistribucionManual] = useState(false)
  const [saving, setSaving] = useState(false)

  const proveedoresConSaldo = useMemo(
    () => proveedores.filter((p) => p.saldoProveedor > 0),
    [proveedores],
  )

  const facturasProveedor = useMemo(() => {
    if (!proveedorId) return []
    return facturas.filter(
      (f) =>
        f.proveedorId === proveedorId &&
        ESTADOS_FACTURA_PAGABLES.has(f.estado) &&
        f.saldoPendiente > 0,
    )
  }, [facturas, proveedorId])

  const montoTotalNum = parseNumeroInput(montoTotal)

  const sumaAplicada = useMemo(
    () =>
      roundMoney(
        facturasProveedor.reduce((acc, f) => acc + (montosAplicados[f.id] ?? 0), 0),
      ),
    [facturasProveedor, montosAplicados],
  )

  useEffect(() => {
    if (!open) return
    setProveedorId('')
    setFechaPago(hoyYmdLocal())
    setMetodoPago('TRANSFERENCIA')
    setReferenciaPago('')
    setMontoTotal('')
    setObservaciones('')
    setSeleccionadas(new Set())
    setMontosAplicados({})
    setDistribucionManual(false)
  }, [open])

  useEffect(() => {
    setSeleccionadas(new Set())
    setMontosAplicados({})
    setDistribucionManual(false)
  }, [proveedorId])

  useEffect(() => {
    if (distribucionManual || seleccionadas.size === 0 || montoTotalNum <= 0) return
    setMontosAplicados(distribuirMontoFifo(facturasProveedor, seleccionadas, montoTotalNum))
  }, [
    montoTotalNum,
    seleccionadas,
    facturasProveedor,
    distribucionManual,
  ])

  function toggleFactura(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!distribucionManual) setDistribucionManual(false)
  }

  function seleccionarTodas() {
    setSeleccionadas(new Set(facturasProveedor.map((f) => f.id)))
  }

  function handleMontoAplicadoChange(facturaId: string, raw: string) {
    setDistribucionManual(true)
    const n = roundMoney(Math.max(0, parseNumeroInput(raw)))
    setMontosAplicados((prev) => ({ ...prev, [facturaId]: n }))
  }

  function redistribuirAutomatico() {
    setDistribucionManual(false)
    if (seleccionadas.size === 0 || montoTotalNum <= 0) return
    setMontosAplicados(distribuirMontoFifo(facturasProveedor, seleccionadas, montoTotalNum))
  }

  const facturasConMonto = facturasProveedor.filter(
    (f) => seleccionadas.has(f.id) && (montosAplicados[f.id] ?? 0) > 0,
  )

  const montosCuadran = moneyIgual(sumaAplicada, montoTotalNum)
  const excedeSaldoFactura = facturasProveedor.some((f) => {
    const m = montosAplicados[f.id] ?? 0
    return m > roundMoney(f.saldoPendiente + 0.001)
  })

  const formValid =
    proveedorId &&
    fechaPago &&
    referenciaPago.trim() &&
    montoTotalNum > 0 &&
    facturasConMonto.length > 0 &&
    montosCuadran &&
    !excedeSaldoFactura

  async function handleSave() {
    if (!user || !formValid) return
    setSaving(true)
    try {
      const facturasAplicadas = facturasConMonto.map((f) => ({
        facturaId: f.id,
        montoAplicado: roundMoney(montosAplicados[f.id] ?? 0),
      }))

      const result = await registrarOrdenPago({
        proveedorId,
        fechaPago: new Date(`${fechaPago}T12:00:00`),
        montoTotal: montoTotalNum,
        metodoPago,
        referenciaPago: referenciaPago.trim(),
        facturasAplicadas,
        observaciones: observaciones.trim() || undefined,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })

      showToast(`Orden de pago ${result.numero} emitida correctamente.`, 'success')
      onClose()
    } catch (err) {
      showToast(mensajeErrorTesoreria(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TesoreriaFormModal
      open={open}
      title="Nueva orden de pago"
      subtitle="Imputá el pago contra facturas pendientes del proveedor."
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel="Emitir orden de pago"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="op-proveedor">
              Proveedor (con saldo)
            </label>
            <select
              id="op-proveedor"
              className={inputClass}
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
            >
              <option value="">Seleccioná proveedor…</option>
              {proveedoresConSaldo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · Saldo {formatMonedaArs(p.saldoProveedor)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="op-fecha">
              Fecha de pago
            </label>
            <input
              id="op-fecha"
              type="date"
              className={inputClass}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="op-metodo">
              Método de pago
            </label>
            <select
              id="op-metodo"
              className={inputClass}
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="op-ref">
              Referencia / comprobante
            </label>
            <input
              id="op-ref"
              type="text"
              className={inputClass}
              placeholder="CBU, N° transferencia, cheque…"
              value={referenciaPago}
              onChange={(e) => setReferenciaPago(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="op-monto">
            Monto total del pago
          </label>
          <input
            id="op-monto"
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
          />
        </div>

        {proveedorId ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-neutral-800">
                Facturas a imputar
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={seleccionarTodas}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Seleccionar todas
                </button>
                <button
                  type="button"
                  onClick={redistribuirAutomatico}
                  disabled={seleccionadas.size === 0 || montoTotalNum <= 0}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-[#CD1818] hover:bg-[#CD1818]/5 disabled:opacity-50"
                >
                  Redistribuir automático
                </button>
              </div>
            </div>

            {facturasProveedor.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No hay facturas pendientes de pago para este proveedor.
              </p>
            ) : (
              <ul className="space-y-2">
                {facturasProveedor.map((f) => {
                  const checked = seleccionadas.has(f.id)
                  const monto = montosAplicados[f.id] ?? 0
                  return (
                    <li
                      key={f.id}
                      className={`rounded-lg border px-3 py-2.5 transition ${
                        checked
                          ? 'border-[#CD1818]/30 bg-white'
                          : 'border-neutral-200 bg-white/60'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFactura(f.id)}
                          className="mt-1 h-4 w-4 rounded border-neutral-300 text-[#CD1818]"
                          aria-label={`Seleccionar factura ${f.numeroFactura}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-900">
                              {f.numeroFactura}
                            </span>
                            <EstadoBadge tipo="factura" estado={f.estado} />
                          </div>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            Vence {formatYmdLegible(f.fechaVencimiento)} · Saldo{' '}
                            {formatMonedaArs(f.saldoPendiente, f.moneda)}
                          </p>
                        </div>
                        <div className="w-full sm:w-36">
                          <label className="sr-only" htmlFor={`monto-${f.id}`}>
                            Monto aplicado
                          </label>
                          <input
                            id={`monto-${f.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!checked}
                            className={`${inputClass} mt-0 tabular-nums`}
                            value={checked && monto > 0 ? String(monto) : checked ? '0' : ''}
                            onChange={(e) => handleMontoAplicadoChange(f.id, e.target.value)}
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3 text-sm">
              <span className="text-neutral-600">
                Suma imputada:{' '}
                <strong className="tabular-nums text-neutral-900">
                  {formatMonedaArs(sumaAplicada)}
                </strong>
              </span>
              {!montosCuadran && montoTotalNum > 0 ? (
                <span className="text-xs font-medium text-amber-700">
                  Debe coincidir con el monto total ({formatMonedaArs(montoTotalNum)})
                </span>
              ) : null}
              {excedeSaldoFactura ? (
                <span className="text-xs font-medium text-red-700">
                  Algún monto supera el saldo pendiente de la factura.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelClass} htmlFor="op-obs">
            Observaciones (opcional)
          </label>
          <textarea
            id="op-obs"
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
