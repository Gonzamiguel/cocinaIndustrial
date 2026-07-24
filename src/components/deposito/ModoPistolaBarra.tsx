import { ScanLine } from 'lucide-react'

type Props = {
  activo: boolean
  onToggle: () => void
  disabled?: boolean
  hint?: string
}

export function ModoPistolaBarra({ activo, onToggle, disabled, hint }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        activo
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-900">
          Modo pistola {activo ? 'activo' : 'inactivo'}
        </p>
        <p className="mt-0.5 text-xs text-neutral-600">
          {hint ??
            (activo
              ? 'Escaneá el código de barras del producto. Completá cantidad y lote donde corresponda.'
              : 'Activá para escanear códigos EAN del envase con la pistola USB.')}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
          activo
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100'
        }`}
      >
        <ScanLine className="h-4 w-4" aria-hidden />
        {activo ? 'Desactivar' : 'Activar pistola'}
      </button>
    </div>
  )
}
