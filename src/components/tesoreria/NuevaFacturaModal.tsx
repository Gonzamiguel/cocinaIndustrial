import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { ComprobanteUploadField } from '../compras/ComprobanteUploadField'
import {
  mensajeErrorDocumento,
  subirDocumentoAdjunto,
} from '../../lib/documentos'
import { registrarFacturaProveedor } from '../../lib/tesoreria'
import { cargarPrefillFacturaOc, type PrefillFacturaOc } from '../../lib/comprasQueries'
import {
  esProveedorTesoreria,
  ocPendienteFacturar,
  type ProveedorTesoreria,
} from '../../lib/tesoreriaQueries'
import {
  hoyYmdLocal,
  mensajeErrorTesoreria,
  nombreUsuarioFromAuth,
  parseNumeroInput,
  roundMoney,
} from '../../lib/tesoreriaUi'
import type { OrdenCompra } from '../../types/compras'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from './TesoreriaFormModal'

export type NuevaFacturaModalProps = {
  open: boolean
  onClose: () => void
  proveedores: ProveedorTesoreria[]
  ordenesCompra: OrdenCompra[]
  /** Pre-selección al abrir desde bandeja pendientes de facturar. */
  ordenCompraIdInicial?: string
  proveedorIdInicial?: string
}

export function NuevaFacturaModal({
  open,
  onClose,
  proveedores,
  ordenesCompra,
  ordenCompraIdInicial,
  proveedorIdInicial,
}: NuevaFacturaModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [proveedorId, setProveedorId] = useState('')
  const [ordenCompraId, setOrdenCompraId] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fechaEmision, setFechaEmision] = useState(hoyYmdLocal())
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [neto, setNeto] = useState('')
  const [montoIva, setMontoIva] = useState('')
  const [montoPercepciones, setMontoPercepciones] = useState('')
  const [total, setTotal] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [archivoFactura, setArchivoFactura] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [cargandoPrefill, setCargandoPrefill] = useState(false)
  const [prefill, setPrefill] = useState<PrefillFacturaOc | null>(null)

  const proveedoresOpciones = useMemo(
    () => proveedores.filter(esProveedorTesoreria),
    [proveedores],
  )

  const ocsFiltradas = useMemo(() => {
    if (!proveedorId) return []
    return ordenesCompra.filter(
      (oc) => oc.proveedorId === proveedorId && ocPendienteFacturar(oc),
    )
  }, [ordenesCompra, proveedorId])

  const ocSeleccionada = useMemo(
    () => ocsFiltradas.find((oc) => oc.id === ordenCompraId),
    [ocsFiltradas, ordenCompraId],
  )

  useEffect(() => {
    if (!open) return
    const ocPreset = ordenCompraIdInicial?.trim() ?? ''
    const provPreset = proveedorIdInicial?.trim() ?? ''
    const ocRef =
      ocPreset && !provPreset
        ? ordenesCompra.find((oc) => oc.id === ocPreset)
        : undefined
    setProveedorId(provPreset || ocRef?.proveedorId || '')
    setOrdenCompraId(ocPreset)
    setNumeroFactura('')
    setFechaEmision(hoyYmdLocal())
    setFechaVencimiento('')
    setNeto('')
    setMontoIva('')
    setMontoPercepciones('')
    setTotal('')
    setObservaciones('')
    setArchivoFactura(null)
    setPrefill(null)
    setCargandoPrefill(false)
  }, [open, ordenCompraIdInicial, proveedorIdInicial, ordenesCompra])

  useEffect(() => {
    if (!open) return
    const ocId = ordenCompraIdInicial?.trim() || ordenCompraId.trim()
    if (!ocId) {
      setPrefill(null)
      return
    }
    let cancelado = false
    setCargandoPrefill(true)
    void cargarPrefillFacturaOc(ocId)
      .then((data) => {
        if (cancelado || !data) return
        setPrefill(data)
        setNumeroFactura((prev) => prev || data.numeroFactura)
        setFechaEmision((prev) => prev || data.fechaEmision)
        setFechaVencimiento((prev) => prev || data.fechaVencimiento)
        setNeto((prev) => prev || data.neto)
        setMontoIva((prev) => prev || data.montoIva)
        setMontoPercepciones((prev) => prev || data.montoPercepciones)
        setTotal((prev) => prev || data.total)
      })
      .finally(() => {
        if (!cancelado) setCargandoPrefill(false)
      })
    return () => {
      cancelado = true
    }
  }, [open, ordenCompraIdInicial, ordenCompraId])

  useEffect(() => {
    if (!open || ordenCompraIdInicial) return
    setOrdenCompraId('')
  }, [proveedorId, open, ordenCompraIdInicial])

  useEffect(() => {
    if (!ocSeleccionada) return
    if (!fechaVencimiento && ocSeleccionada.fechaEntregaEstimada) {
      setFechaVencimiento(ocSeleccionada.fechaEntregaEstimada)
    }
  }, [ocSeleccionada, fechaVencimiento])

  function recalcularTotal(n: string, iva: string, perc: string) {
    const t = roundMoney(parseNumeroInput(n) + parseNumeroInput(iva) + parseNumeroInput(perc))
    setTotal(t > 0 ? String(t) : '')
  }

  function handleBlurTotales() {
    recalcularTotal(neto, montoIva, montoPercepciones)
  }

  const totalNum = parseNumeroInput(total)
  const formValid =
    proveedorId &&
    ordenCompraId &&
    numeroFactura.trim() &&
    fechaEmision &&
    fechaVencimiento &&
    totalNum > 0

  async function handleSave() {
    if (!user || !formValid) return
    setSaving(true)
    try {
      const result = await registrarFacturaProveedor({
        numeroFactura: numeroFactura.trim(),
        proveedorId,
        ordenCompraId,
        fechaEmision: new Date(`${fechaEmision}T12:00:00`),
        fechaVencimiento,
        neto: parseNumeroInput(neto),
        montoIva: parseNumeroInput(montoIva),
        montoPercepciones: parseNumeroInput(montoPercepciones),
        total: totalNum,
        moneda: ocSeleccionada?.moneda ?? 'ARS',
        observaciones: observaciones.trim() || undefined,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })

      if (archivoFactura) {
        try {
          await subirDocumentoAdjunto({
            file: archivoFactura,
            entidadId: result.facturaId,
            entidadTipo: 'FACTURA_PROVEEDOR',
            tipoComprobante: 'FACTURA',
            ordenCompraId,
            proveedorId,
            usuario: {
              uid: user.uid,
              nombre: nombreUsuarioFromAuth(user),
            },
          })
        } catch (docErr) {
          showToast(
            `Factura ${result.numeroFactura} registrada, pero no se pudo adjuntar el PDF: ${mensajeErrorDocumento(docErr)}`,
            'error',
          )
          onClose()
          return
        }
      }

      showToast(
        archivoFactura
          ? `Factura ${result.numeroFactura} registrada y PDF archivado.`
          : `Factura ${result.numeroFactura} registrada correctamente.`,
        'success',
      )
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
      title="Registrar factura de proveedor"
      subtitle="Vinculá la factura a una orden de compra ya recibida en depósito."
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel="Registrar factura"
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        {cargandoPrefill ? (
          <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Cargando datos sugeridos desde la recepción de depósito…
          </p>
        ) : null}
        {prefill && !cargandoPrefill ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold">Sugerido desde depósito</p>
            <p className="mt-1 text-emerald-900">
              {prefill.numeroComprobanteDeposito
                ? `Comprobante ${prefill.tipoComprobanteDeposito === 'FACTURA' ? 'factura' : 'remito'} Nº ${prefill.numeroComprobanteDeposito}. `
                : ''}
              Montos calculados según saldo pendiente de la OC.
              {prefill.pdfEnExpedienteOc
                ? ' El PDF ya está en el expediente de la OC; no hace falta volver a subirlo.'
                : ' Podés adjuntar el PDF fiscal abajo si lo tenés.'}
            </p>
          </div>
        ) : null}
        <div>
          <label className={labelClass} htmlFor="nf-proveedor">
            Proveedor
          </label>
          <select
            id="nf-proveedor"
            className={inputClass}
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
          >
            <option value="">Seleccioná un proveedor…</option>
            {proveedoresOpciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.cuit ? ` · CUIT ${p.cuit}` : ''}
              </option>
            ))}
          </select>
          {proveedoresOpciones.length === 0 ? (
            <p className="mt-1.5 text-xs text-amber-700">
              No hay proveedores configurados. Marcá empresas con rol PROVEEDOR en el padrón.
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="nf-oc">
            Orden de compra
          </label>
          <select
            id="nf-oc"
            className={inputClass}
            value={ordenCompraId}
            disabled={!proveedorId}
            onChange={(e) => setOrdenCompraId(e.target.value)}
          >
            <option value="">
              {proveedorId ? 'Seleccioná una OC recibida…' : 'Primero elegí proveedor'}
            </option>
            {ocsFiltradas.map((oc) => (
              <option key={oc.id} value={oc.id}>
                {oc.numero} · {oc.estado.replace(/_/g, ' ')}
                {oc.montoFacturadoAcumulado
                  ? ` · Facturado $${oc.montoFacturadoAcumulado.toLocaleString('es-AR')}`
                  : ''}
              </option>
            ))}
          </select>
          {proveedorId && ocsFiltradas.length === 0 ? (
            <p className="mt-1.5 text-xs text-neutral-500">
              No hay OC en estado RECIBIDA PARCIAL o COMPLETADA para este proveedor.
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="nf-numero">
            Número de factura
          </label>
          <input
            id="nf-numero"
            type="text"
            className={inputClass}
            placeholder="Ej. A-0001-00004562"
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="nf-emision">
              Fecha de emisión
            </label>
            <input
              id="nf-emision"
              type="date"
              className={inputClass}
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nf-vencimiento">
              Fecha de vencimiento
            </label>
            <input
              id="nf-vencimiento"
              type="date"
              className={inputClass}
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="nf-neto">
              Neto gravado
            </label>
            <input
              id="nf-neto"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={neto}
              onChange={(e) => setNeto(e.target.value)}
              onBlur={handleBlurTotales}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nf-iva">
              IVA
            </label>
            <input
              id="nf-iva"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={montoIva}
              onChange={(e) => setMontoIva(e.target.value)}
              onBlur={handleBlurTotales}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nf-perc">
              Percepciones
            </label>
            <input
              id="nf-perc"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={montoPercepciones}
              onChange={(e) => setMontoPercepciones(e.target.value)}
              onBlur={handleBlurTotales}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nf-total">
              Total
            </label>
            <input
              id="nf-total"
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="nf-obs">
            Observaciones (opcional)
          </label>
          <textarea
            id="nf-obs"
            rows={2}
            className={`${inputClass} min-h-[4.5rem] resize-y`}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        <ComprobanteUploadField
          label={
            prefill?.pdfEnExpedienteOc
              ? 'PDF adicional (opcional)'
              : 'PDF de la factura (opcional)'
          }
          hint={
            prefill?.pdfEnExpedienteOc
              ? 'Depósito ya archivó un comprobante en el expediente de la OC.'
              : 'Adjuntá el comprobante recibido por mail. Queda en el expediente de la factura.'
          }
          disabled={saving}
          file={archivoFactura}
          onFileChange={setArchivoFactura}
        />
      </div>
    </TesoreriaFormModal>
  )
}
