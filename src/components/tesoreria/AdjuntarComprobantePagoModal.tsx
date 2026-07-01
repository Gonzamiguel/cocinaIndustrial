import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { ComprobanteUploadField } from '../compras/ComprobanteUploadField'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  formatearTamanoArchivo,
  mensajeErrorDocumento,
  subirDocumentoAdjunto,
} from '../../lib/documentos'
import { formatFechaTimestamp, formatMonedaArs, nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { DocumentoAdjunto } from '../../types/documentos'
import type { OrdenPago } from '../../types/tesoreria'
import { labelClass, TesoreriaFormModal } from './TesoreriaFormModal'

export type AdjuntarComprobantePagoModalProps = {
  open: boolean
  onClose: () => void
  ordenPago: OrdenPago | null
  documentos: DocumentoAdjunto[]
  onDocumentoSubido: (doc: DocumentoAdjunto) => void
}

export function AdjuntarComprobantePagoModal({
  open,
  onClose,
  ordenPago,
  documentos,
  onDocumentoSubido,
}: AdjuntarComprobantePagoModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  useEffect(() => {
    if (!open) {
      setArchivo(null)
      setSubiendo(false)
    }
  }, [open])

  async function handleGuardar() {
    if (!user || !ordenPago || !archivo) return
    setSubiendo(true)
    try {
      const doc = await subirDocumentoAdjunto({
        file: archivo,
        entidadId: ordenPago.id,
        entidadTipo: 'ORDEN_PAGO',
        tipoComprobante: 'COMPROBANTE_PAGO',
        proveedorId: ordenPago.proveedorId,
        usuario: {
          uid: user.uid,
          nombre: nombreUsuarioFromAuth(user),
        },
      })
      onDocumentoSubido(doc)
      showToast(`Comprobante de pago archivado para ${ordenPago.numero}.`, 'success')
      onClose()
    } catch (err) {
      showToast(mensajeErrorDocumento(err), 'error')
    } finally {
      setSubiendo(false)
    }
  }

  if (!ordenPago) return null

  const comprobantes = documentos.filter(
    (d) => d.entidadId === ordenPago.id && d.tipoComprobante === 'COMPROBANTE_PAGO',
  )

  return (
    <TesoreriaFormModal
      open={open}
      title="Comprobante de pago"
      subtitle={`Adjuntá transferencia, cheque u otro respaldo de la ${ordenPago.numero}.`}
      onClose={onClose}
      onSave={() => void handleGuardar()}
      saving={subiendo}
      saveDisabled={!archivo}
      saveLabel="Guardar comprobante"
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <dl className="grid gap-3 rounded-xl border border-neutral-100 bg-neutral-50/80 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Orden de pago
            </dt>
            <dd className="mt-1 font-mono font-semibold text-neutral-900">{ordenPago.numero}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Monto</dt>
            <dd className="mt-1 font-semibold tabular-nums text-neutral-900">
              {formatMonedaArs(ordenPago.montoTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Método</dt>
            <dd className="mt-1 text-neutral-800">{ordenPago.metodoPago}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Referencia
            </dt>
            <dd className="mt-1 text-neutral-800">{ordenPago.referenciaPago}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Fecha de pago
            </dt>
            <dd className="mt-1 text-neutral-800">
              {formatFechaTimestamp(ordenPago.fechaPago)}
            </dd>
          </div>
        </dl>

        {comprobantes.length > 0 ? (
          <div>
            <p className={labelClass}>Comprobantes ya archivados</p>
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {comprobantes.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-neutral-800">{doc.nombreArchivo}</span>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#CD1818] hover:underline"
                  >
                    Ver archivo
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <span className="w-full text-xs text-neutral-500 sm:w-auto">
                    {formatFechaTimestamp(doc.fechaSubida)} · {formatearTamanoArchivo(doc.tamanoBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ComprobanteUploadField
          label={comprobantes.length > 0 ? 'Agregar otro comprobante' : 'Archivo del comprobante'}
          hint="PDF o imagen del cheque, transferencia bancaria, retención, etc."
          disabled={subiendo}
          file={archivo}
          onFileChange={setArchivo}
        />

        <p className="text-xs text-neutral-500">
          El archivo queda en el legajo del proveedor y vinculado a esta orden de pago.
        </p>
      </div>
    </TesoreriaFormModal>
  )
}
