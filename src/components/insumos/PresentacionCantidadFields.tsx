import type { Insumo } from '../../lib/insumos'
import {
  PRESENTACION_BASE_ID,
  opcionesPresentacionEmpaque,
  textoConversionUnidadBase,
} from '../../lib/presentacionesInsumo'

const inputCompact =
  'mt-1.5 w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

type Props = {
  insumo: Insumo | undefined
  cantidad: string
  presentacionEmpaqueId: string
  onCantidadChange: (value: string) => void
  onPresentacionChange: (presentacionId: string) => void
  cantidadInputRef?: (el: HTMLInputElement | null) => void
  min?: number
  max?: number
  placeholder?: string
  required?: boolean
  layout?: 'stacked' | 'inline'
  maxHint?: string | null
}

export function PresentacionCantidadFields({
  insumo,
  cantidad,
  presentacionEmpaqueId,
  onCantidadChange,
  onPresentacionChange,
  cantidadInputRef,
  min,
  max,
  placeholder = '0',
  required = false,
  layout = 'stacked',
  maxHint = null,
}: Props) {
  const opciones = opcionesPresentacionEmpaque(insumo)
  const factor =
    opciones.find((o) => o.id === presentacionEmpaqueId)?.factor ?? 1
  const conversion =
    insumo && factor !== 1
      ? textoConversionUnidadBase(cantidad, factor, insumo.unidadBase)
      : null

  const cantidadBlock = (
    <label className="block min-w-0 flex-1 text-left">
      <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
        Cantidad
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        ref={cantidadInputRef}
        value={cantidad}
        onChange={(e) => onCantidadChange(e.target.value)}
        className={`${inputCompact} ${layout === 'inline' ? 'md:w-24' : 'w-full'}`}
        placeholder={placeholder}
        required={required}
      />
      {conversion ? (
        <span className="mt-1 block text-xs text-[#8997A6]">{conversion}</span>
      ) : null}
      {maxHint ? (
        <span className="mt-1 block text-[11px] text-[#8997A6]">{maxHint}</span>
      ) : null}
    </label>
  )

  const empaqueBlock = (
    <label className="block min-w-0 flex-1 text-left">
      <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
        Empaque / presentación
      </span>
      <select
        value={presentacionEmpaqueId || PRESENTACION_BASE_ID}
        onChange={(e) => onPresentacionChange(e.target.value)}
        disabled={!insumo}
        className={inputCompact}
      >
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.factor !== 1 ? ` (×${o.factor})` : ''}
          </option>
        ))}
      </select>
    </label>
  )

  if (layout === 'inline') {
    return (
      <div className="col-span-12 flex flex-col gap-2 md:col-span-4 md:flex-row md:items-end">
        {cantidadBlock}
        {empaqueBlock}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {cantidadBlock}
        {empaqueBlock}
      </div>
    </div>
  )
}
