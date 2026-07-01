import { useRef, useState } from 'react'
import { Camera, FileText, X } from 'lucide-react'
import { formatearTamanoArchivo, MAX_TAMANO_DOCUMENTO_BYTES } from '../../lib/documentos'

const maxMb = Math.round(MAX_TAMANO_DOCUMENTO_BYTES / (1024 * 1024))

export type ComprobanteUploadFieldProps = {
  label: string
  hint?: string
  required?: boolean
  disabled?: boolean
  file: File | null
  onFileChange: (file: File | null) => void
}

export function ComprobanteUploadField({
  label,
  hint,
  required = false,
  disabled = false,
  file,
  onFileChange,
}: ComprobanteUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  function seleccionarArchivo(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (next?.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(next))
    } else {
      setPreviewUrl(null)
    }
    onFileChange(next)
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
        {required ? <span className="text-[#CD1818]"> *</span> : null}
      </label>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}

      {file ? (
        <div className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vista previa del remito"
              className="h-16 w-16 shrink-0 rounded-lg border border-white object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              <FileText className="h-8 w-8 text-red-600" aria-hidden />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">{file.name}</p>
            <p className="text-xs text-neutral-600">{formatearTamanoArchivo(file.size)}</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => seleccionarArchivo(null)}
            className="rounded-lg p-2 text-neutral-400 transition hover:bg-white hover:text-red-600 disabled:opacity-40"
            aria-label="Quitar archivo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => seleccionarArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 text-sm font-semibold text-neutral-700 transition hover:border-[#CD1818]/40 hover:bg-[#CD1818]/5 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            <Camera className="h-4 w-4 text-[#CD1818]" aria-hidden />
            Sacar foto o elegir PDF
          </button>
          <p className="mt-1.5 text-[11px] text-neutral-400">PDF o imagen · máx. {maxMb} MB</p>
        </div>
      )}
    </div>
  )
}
