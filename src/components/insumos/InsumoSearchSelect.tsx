import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Insumo } from '../../lib/insumos'
import { formatLabelInsumo } from '../../lib/insumos'

type Props = {
  insumos: Insumo[]
  /** Document id del insumo seleccionado */
  selectedId: string | null
  /** Etiqueta ya conocida (ej. fila cargada desde receta) */
  selectedLabel?: string
  onSelect: (insumo: Insumo) => void
  onClear: () => void
  disabled?: boolean
  placeholder?: string
  /** Filas densas (depósito): menos alto y texto truncado */
  compact?: boolean
  /** Oculta la etiqueta arriba del campo en md+ (cuando hay cabecera de tabla aparte) */
  hideLabelOnDesktop?: boolean
  /**
   * Tras elegir un insumo (clic o Enter), se invoca en el siguiente microtask
   * para enfocar p. ej. el input de cantidad de la misma fila.
   */
  onAfterSelect?: () => void
}

export function InsumoSearchSelect({
  insumos,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  disabled,
  placeholder = 'Buscar por nombre, marca o presentación…',
  compact = false,
  hideLabelOnDesktop = false,
  onAfterSelect,
}: Props) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedId
    ? insumos.find((i) => i.id === selectedId)
    : undefined

  const displayText =
    selected != null
      ? formatLabelInsumo(selected)
      : selectedLabel?.trim() || ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return insumos.slice(0, 80)
    return insumos.filter((i) => {
      const blob = `${i.nombreGenerico} ${i.marca} ${i.presentacion} ${formatLabelInsumo(i)}`.toLowerCase()
      return blob.includes(q)
    })
  }, [insumos, query])

  useEffect(() => {
    if (!open) return
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [open, filtered.length])

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  function commitSelection(insumo: Insumo) {
    onSelect(insumo)
    setQuery('')
    setOpen(false)
    setActiveIndex(0)
    queueMicrotask(() => {
      onAfterSelect?.()
    })
  }

  const labelClass = `text-xs font-medium text-[#8997A6] ${
    hideLabelOnDesktop ? 'md:hidden' : ''
  }`

  const inputClass = compact
    ? 'mt-1.5 w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:opacity-50'
    : 'mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:opacity-50'

  if (disabled) {
    return (
      <div>
        <span className={labelClass}>Insumo del catálogo</span>
        <div
          className={`${inputClass} flex items-center`}
        >
          {displayText || '—'}
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <span className={labelClass}>Insumo del catálogo</span>
      {selectedId && selected ? (
        <div
          className={`flex flex-wrap items-stretch ${compact ? 'mt-1.5 gap-1.5' : 'mt-2 gap-2'}`}
        >
          <div
            className={`min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-[#171717] ${compact ? 'min-h-10 py-2 leading-snug' : 'min-h-12 px-4 py-3'}`}
          >
            <span className="line-clamp-2">
              {formatLabelInsumo(selected)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
              setOpen(false)
            }}
            className={`shrink-0 rounded-xl border border-gray-200 font-semibold text-[#8997A6] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] ${compact ? 'min-h-10 px-2.5 text-xs' : 'min-h-12 px-4 text-sm'}`}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={open ? query : displayText}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!open) setOpen(true)
              setActiveIndex(0)
            }}
            onFocus={() => {
              setOpen(true)
              setQuery(displayText)
            }}
            onKeyDown={(e) => {
              if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                setOpen(true)
                setQuery(displayText)
                return
              }
              if (!open) return

              if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
                setQuery('')
                return
              }

              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (filtered.length === 0) return
                setActiveIndex((i) => (i + 1) % filtered.length)
                return
              }

              if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (filtered.length === 0) return
                setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                const pick = filtered[activeIndex]
                if (pick) commitSelection(pick)
                return
              }
            }}
            placeholder={placeholder}
            className={inputClass}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
          />
          {open ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-[#8997A6]">
                  No hay coincidencias.
                </li>
              ) : (
                filtered.map((i, idx) => (
                  <li key={i.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-gray-50 ${
                        idx === activeIndex ? 'bg-[#CD1818]/8 text-[#171717]' : 'text-[#171717]'
                      }`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commitSelection(i)}
                    >
                      {formatLabelInsumo(i)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}
