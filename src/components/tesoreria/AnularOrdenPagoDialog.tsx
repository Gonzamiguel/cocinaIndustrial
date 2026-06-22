import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export type AnularOrdenPagoDialogProps = {
  open: boolean
  numeroOp: string
  isWorking?: boolean
  onConfirm: (motivo: string) => void
  onCancel: () => void
}

export function AnularOrdenPagoDialog({
  open,
  numeroOp,
  isWorking = false,
  onConfirm,
  onCancel,
}: AnularOrdenPagoDialogProps) {
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!open) return
    setMotivo('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isWorking) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isWorking, onCancel])

  if (!open) return null

  const motivoOk = motivo.trim().length >= 5

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
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-[#171717]">
          Anular orden de pago
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#8997A6]">
          Vas a anular la OP <strong className="text-neutral-800">{numeroOp}</strong>. Se revertirán
          las imputaciones sobre las facturas y se restaurará el saldo del proveedor.
        </p>

        <div className="mt-4">
          <label className="text-xs font-medium text-neutral-600" htmlFor="anular-op-motivo">
            Motivo de anulación
          </label>
          <textarea
            id="anular-op-motivo"
            rows={3}
            disabled={isWorking}
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15 disabled:opacity-50"
            placeholder="Describí el motivo (mín. 5 caracteres)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={isWorking}
            onClick={onCancel}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!motivoOk || isWorking}
            onClick={() => onConfirm(motivo.trim())}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Anulando…
              </>
            ) : (
              'Anular OP'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
