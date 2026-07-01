import { useCallback, useRef, useState } from 'react'
import { FileImage, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  eliminarDocumentoAdjunto,
  esDocumentoImagen,
  esDocumentoPdf,
  formatearTamanoArchivo,
  MAX_TAMANO_DOCUMENTO_BYTES,
  mensajeErrorDocumento,
  subirDocumentoAdjunto,
} from '../../lib/documentos'
import { nombreUsuarioFromAuth, formatFechaTimestamp } from '../../lib/tesoreriaUi'
import type {
  DocumentoAdjunto,
  EntidadTipoDocumento,
  TipoComprobanteDocumento,
} from '../../types/documentos'

const cardInnerClass =
  'rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors'

const selectClass =
  'min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15'

function etiquetaTipoComprobante(tipo: TipoComprobanteDocumento): string {
  switch (tipo) {
    case 'FACTURA':
      return 'Factura'
    case 'REMITO':
      return 'Remito'
    default:
      return 'Otro'
  }
}

function IconoDocumento({ doc }: { doc: DocumentoAdjunto }) {
  if (esDocumentoPdf(doc)) {
    return <FileText className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
  }
  if (esDocumentoImagen(doc)) {
    return <FileImage className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
  }
  return <FileText className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
}

export type DocumentosAdjuntosPanelProps = {
  entidadId: string
  entidadTipo: EntidadTipoDocumento
  documentos: DocumentoAdjunto[]
  onDocumentosChange: (documentos: DocumentoAdjunto[]) => void
  puedeSubir: boolean
  ordenCompraId?: string
  proveedorId?: string
}

export function DocumentosAdjuntosPanel({
  entidadId,
  entidadTipo,
  documentos,
  onDocumentosChange,
  puedeSubir,
  ordenCompraId,
  proveedorId,
}: DocumentosAdjuntosPanelProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobanteDocumento>('REMITO')
  const [arrastrando, setArrastrando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const procesarArchivo = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !puedeSubir || !user) return
      setSubiendo(true)
      setProgreso(0)
      try {
        const nuevo = await subirDocumentoAdjunto({
          file,
          entidadId,
          entidadTipo,
          tipoComprobante,
          ordenCompraId,
          proveedorId,
          usuario: {
            uid: user.uid,
            nombre: nombreUsuarioFromAuth(user),
          },
          onProgress: setProgreso,
        })
        onDocumentosChange(
          [nuevo, ...documentos].sort(
            (a, b) =>
              (b.fechaSubida?.toMillis?.() ?? 0) - (a.fechaSubida?.toMillis?.() ?? 0),
          ),
        )
        showToast(`«${nuevo.nombreArchivo}» adjuntado al expediente.`, 'success')
      } catch (err) {
        showToast(mensajeErrorDocumento(err), 'error')
      } finally {
        setSubiendo(false)
        setProgreso(0)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [
      puedeSubir,
      user,
      entidadId,
      entidadTipo,
      tipoComprobante,
      ordenCompraId,
      proveedorId,
      documentos,
      onDocumentosChange,
      showToast,
    ],
  )

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    if (!puedeSubir || subiendo) return
    const file = e.dataTransfer.files?.[0]
    void procesarArchivo(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    void procesarArchivo(file)
  }

  async function handleEliminar(doc: DocumentoAdjunto) {
    if (!puedeSubir || eliminandoId) return
    const ok = window.confirm(`¿Eliminar «${doc.nombreArchivo}» del expediente?`)
    if (!ok) return
    setEliminandoId(doc.id)
    try {
      await eliminarDocumentoAdjunto(doc.id, doc.url, doc.storagePath)
      onDocumentosChange(documentos.filter((d) => d.id !== doc.id))
      showToast('Documento eliminado.', 'success')
    } catch (err) {
      showToast(mensajeErrorDocumento(err), 'error')
    } finally {
      setEliminandoId(null)
    }
  }

  const maxMb = Math.round(MAX_TAMANO_DOCUMENTO_BYTES / (1024 * 1024))

  return (
    <div>
      {puedeSubir ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:max-w-xs">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Tipo de comprobante
            </label>
            <select
              className={selectClass}
              value={tipoComprobante}
              disabled={subiendo}
              onChange={(e) =>
                setTipoComprobante(e.target.value as TipoComprobanteDocumento)
              }
            >
              <option value="FACTURA">Factura escaneada</option>
              <option value="REMITO">Remito</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <p className="text-xs text-neutral-500">
            PDF o imagen · máx. {maxMb} MB por archivo
          </p>
        </div>
      ) : null}

      <div
        className={`${cardInnerClass} ${
          arrastrando
            ? 'border-[#CD1818] bg-[#CD1818]/5'
            : puedeSubir
              ? 'border-neutral-200 bg-neutral-50/80'
              : 'border-neutral-100 bg-neutral-50 opacity-80'
        } ${subiendo ? 'pointer-events-none opacity-90' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          if (puedeSubir && !subiendo) setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={handleDrop}
      >
        {subiendo ? (
          <>
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm font-medium text-neutral-700">Subiendo archivo… {progreso}%</p>
            <div
              className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-neutral-200"
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[#CD1818] transition-all duration-200"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Upload className="mx-auto mb-3 h-10 w-10 text-neutral-300" aria-hidden />
            <p className="text-sm font-medium text-neutral-700">
              {puedeSubir
                ? 'Arrastrá PDFs o imágenes aquí'
                : 'Solo lectura para tu rol'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Se guardarán en el expediente digital vinculado a esta entidad.
            </p>
            {puedeSubir ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  Seleccionar archivo
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {documentos.length > 0 ? (
        <ul className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
          {documentos.map((docu) => (
            <li
              key={docu.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:flex-nowrap sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <IconoDocumento doc={docu} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-800">{docu.nombreArchivo}</p>
                  <p className="text-xs text-neutral-500">
                    {etiquetaTipoComprobante(docu.tipoComprobante)} ·{' '}
                    {formatFechaTimestamp(docu.fechaSubida)} ·{' '}
                    {formatearTamanoArchivo(docu.tamanoBytes)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
                <a
                  href={docu.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/5"
                >
                  Ver / descargar
                </a>
                {puedeSubir ? (
                  <button
                    type="button"
                    disabled={eliminandoId === docu.id}
                    onClick={() => void handleEliminar(docu)}
                    className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Eliminar ${docu.nombreArchivo}`}
                  >
                    {eliminandoId === docu.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-neutral-400">No hay documentos cargados todavía.</p>
      )}
    </div>
  )
}
