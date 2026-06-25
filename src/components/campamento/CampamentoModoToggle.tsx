import { BedDouble, Package } from 'lucide-react'
import type { CampamentoModo } from '../../hooks/useCampamentoModo'

type CampamentoModoToggleProps = {
  modo: CampamentoModo
  onChange: (modo: CampamentoModo) => void
  className?: string
}

const tabBase =
  'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition sm:text-sm'

const tabActive =
  'bg-white text-[#CD1818] shadow-sm ring-1 ring-[#CD1818]/25'

const tabInactive =
  'text-neutral-600 hover:bg-white/80 hover:text-[#CD1818]'

export function CampamentoModoToggle({
  modo,
  onChange,
  className = 'mt-4',
}: CampamentoModoToggleProps) {
  return (
    <div
      className={`grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 ring-1 ring-neutral-200/80 ${className}`}
      role="tablist"
      aria-label="Modo de trabajo Casposo"
    >
      <button
        type="button"
        role="tab"
        aria-selected={modo === 'comensales'}
        onClick={() => onChange('comensales')}
        className={`${tabBase} ${modo === 'comensales' ? tabActive : tabInactive}`}
      >
        <BedDouble className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Comensales</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={modo === 'logistica'}
        onClick={() => onChange('logistica')}
        className={`${tabBase} ${modo === 'logistica' ? tabActive : tabInactive}`}
      >
        <Package className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Stock</span>
      </button>
    </div>
  )
}
