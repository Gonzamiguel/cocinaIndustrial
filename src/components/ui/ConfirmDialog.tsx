import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Deshabilita ambos botones (p. ej. mientras corre una petición). */
  isWorking?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Diálogo modal accesible para confirmaciones destructivas o irreversibles.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isWorking = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isWorking) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isWorking, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isWorking) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-[#171717]"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mt-3 text-sm leading-relaxed text-[#8997A6]"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={isWorking}
            onClick={onCancel}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isWorking}
            onClick={() => onConfirm()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                Procesando…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
