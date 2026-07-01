import { useCallback, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  eliminarDocumentoAdjunto,
  esDocumentoPdf,
  formatearTamanoArchivo,
  MAX_TAMANO_DOCUMENTO_BYTES,
  mensajeErrorDocumento,
  subirDocumentoAdjunto,
} from '../../lib/documentos'
import { formatFechaTimestamp, nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { DocumentoAdjunto } from '../../types/documentos'

const cardInnerClass =
  'rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors'

export type ListaPreciosProveedorPanelProps = {
  proveedorId: string
  documentos: DocumentoAdjunto[]
  onDocumentosChange: (documentos: DocumentoAdjunto[]) => void
  puedeSubir: boolean
}

function esExcel(doc: DocumentoAdjunto): boolean {
  const mime = doc.mimeType?.toLowerCase() ?? ''
  if (mime.includes('spreadsheet') || mime.includes('excel')) return true
  return /\.xlsx?$/i.test(doc.nombreArchivo)
}

export function ListaPreciosProveedorPanel({
  proveedorId,
  documentos,
  onDocumentosChange,
  puedeSubir,
}: ListaPreciosProveedorPanelProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const listas = documentos.filter((d) => d.tipoComprobante === 'LISTA_PRECIOS')

  const procesarArchivo = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !puedeSubir || !user) return
      setSubiendo(true)
      setProgreso(0)
      try {
        const doc = await subirDocumentoAdjunto({
          file,
          entidadId: proveedorId,
          entidadTipo: 'PROVEEDOR',
          tipoComprobante: 'LISTA_PRECIOS',
          proveedorId,
          usuario: {
            uid: user.uid,
            nombre: nombreUsuarioFromAuth(user),
          },
          onProgress: setProgreso,
        })
        onDocumentosChange([doc, ...documentos])
        showToast('Lista de precios archivada en el legajo del proveedor.', 'success')
      } catch (err) {
        showToast(mensajeErrorDocumento(err), 'error')
      } finally {
        setSubiendo(false)
        setProgreso(0)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [documentos, onDocumentosChange, puedeSubir, proveedorId, showToast, user],
  )

  async function handleEliminar(doc: DocumentoAdjunto) {
    if (!puedeSubir || eliminandoId) return
    setEliminandoId(doc.id)
    try {
      await eliminarDocumentoAdjunto(doc.id, doc.url, doc.storagePath)
      onDocumentosChange(documentos.filter((d) => d.id !== doc.id))
      showToast('Lista de precios eliminada.', 'success')
    } catch (err) {
      showToast(mensajeErrorDocumento(err), 'error')
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div className="space-y-4">
      {puedeSubir ? (
        <div
          className={`${cardInnerClass} ${
            arrastrando
              ? 'border-[#CD1818] bg-[#CD1818]/5'
              : 'border-neutral-200 bg-neutral-50/50 hover:border-neutral-300'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            void procesarArchivo(e.dataTransfer.files[0])
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.xlsx,.xls,image/jpeg,image/png,image/webp"
            onChange={(e) => void procesarArchivo(e.target.files?.[0])}
          />
          {subiendo ? (
            <div className="flex flex-col items-center gap-2 text-neutral-600">
              <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
              <p className="text-sm font-medium">Subiendo… {progreso}%</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-[#CD1818]/70" aria-hidden />
              <p className="mt-3 text-sm font-medium text-neutral-800">
                Arrastrá la lista de precios o{' '}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="font-semibold text-[#CD1818] hover:underline"
                >
                  elegí un archivo
                </button>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                PDF, Excel (XLS/XLSX) o imagen · máx.{' '}
                {Math.round(MAX_TAMANO_DOCUMENTO_BYTES / (1024 * 1024))} MB
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          Modo consulta. Solo administrativo finanzas puede cargar listas de precios.
        </p>
      )}

      {listas.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Todavía no hay listas de precios archivadas para este proveedor.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {listas.map((doc) => {
            const Icon = esExcel(doc) ? FileSpreadsheet : FileText
            return (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:flex-nowrap sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 ${esDocumentoPdf(doc) ? 'text-red-600' : 'text-emerald-600'}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-[#CD1818] hover:underline"
                    >
                      {doc.nombreArchivo}
                    </a>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {formatFechaTimestamp(doc.fechaSubida)} ·{' '}
                      {formatearTamanoArchivo(doc.tamanoBytes)}
                      {doc.subidoPorNombre ? ` · ${doc.subidoPorNombre}` : ''}
                    </p>
                  </div>
                </div>
                {puedeSubir ? (
                  <button
                    type="button"
                    disabled={eliminandoId === doc.id}
                    onClick={() => void handleEliminar(doc)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {eliminandoId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Eliminar
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
