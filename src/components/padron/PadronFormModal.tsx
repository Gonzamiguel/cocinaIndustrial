import { Loader2, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

const inputClass =
  'mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 text-sm text-neutral-900 outline-none transition focus:border-[#CD1818]/40 focus:bg-white focus:ring-2 focus:ring-[#CD1818]/15'

const labelClass = 'text-xs font-medium text-neutral-600'

export type PadronFormModalProps = {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  onSave: () => void
  saving?: boolean
  saveDisabled?: boolean
  saveLabel?: string
  children: ReactNode
}

export function PadronFormModal({
  open,
  title,
  subtitle,
  onClose,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel = 'Guardar',
  children,
}: PadronFormModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="padron-form-modal-title"
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
          <div className="min-w-0">
            <h2
              id="padron-form-modal-title"
              className="text-lg font-semibold tracking-tight text-neutral-900"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saveDisabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              saveLabel
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}

export { inputClass, labelClass }
