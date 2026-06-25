import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Insumo } from '../../lib/insumos'
import { formatLabelInsumo } from '../../lib/insumos'

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 20

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

type DropdownRect = { top: number; left: number; width: number }

export function InsumoSearchSelect({
  insumos,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  disabled,
  placeholder = 'Escribí nombre, marca o presentación…',
  compact = false,
  hideLabelOnDesktop = false,
  onAfterSelect,
}: Props) {
  const listboxId = useId()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedId
    ? insumos.find((i) => i.id === selectedId)
    : undefined

  const displayText =
    selected != null
      ? formatLabelInsumo(selected)
      : selectedLabel?.trim() || ''

  const trimmedQuery = query.trim()
  const queryReady = trimmedQuery.length >= MIN_QUERY_LENGTH

  const filtered = useMemo(() => {
    if (!queryReady) return []
    const q = trimmedQuery.toLowerCase()
    const matches: Insumo[] = []
    for (const i of insumos) {
      const blob = `${i.nombreGenerico} ${i.marca} ${i.presentacion} ${formatLabelInsumo(i)}`.toLowerCase()
      if (blob.includes(q)) {
        matches.push(i)
        if (matches.length >= MAX_RESULTS) break
      }
    }
    return matches
  }, [insumos, trimmedQuery, queryReady])

  const showDropdown = focused && !selectedId

  function syncDropdownRect() {
    const el = inputRef.current
    if (!el) {
      setDropdownRect(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }

  useEffect(() => {
    if (!showDropdown) {
      setDropdownRect(null)
      return
    }
    syncDropdownRect()
    function handleLayout() {
      syncDropdownRect()
    }
    window.addEventListener('resize', handleLayout)
    window.addEventListener('scroll', handleLayout, true)
    return () => {
      window.removeEventListener('resize', handleLayout)
      window.removeEventListener('scroll', handleLayout, true)
    }
  }, [showDropdown, query, filtered.length])

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  useEffect(() => {
    if (!showDropdown) return
    function handlePointer(event: MouseEvent) {
      const wrap = wrapRef.current
      const target = event.target as Node
      if (wrap?.contains(target)) return
      const list = document.getElementById(listboxId)
      if (list?.contains(target)) return
      setFocused(false)
      setQuery('')
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [showDropdown, listboxId])

  function commitSelection(insumo: Insumo) {
    onSelect(insumo)
    setQuery('')
    setFocused(false)
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

  const dropdownPanel =
    showDropdown && dropdownRect ? (
      <ul
        id={listboxId}
        role="listbox"
        style={{
          position: 'fixed',
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
          zIndex: 200,
        }}
        className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
      >
        {!queryReady ? (
          <li className="px-4 py-2.5 text-sm text-[#8997A6]">
            Escribí al menos {MIN_QUERY_LENGTH} caracteres para buscar.
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-4 py-2.5 text-sm text-[#8997A6]">
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
    ) : null

  if (disabled) {
    return (
      <div>
        <span className={labelClass}>Insumo del catálogo</span>
        <div className={`${inputClass} flex items-center`}>
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
            <span className="line-clamp-2">{formatLabelInsumo(selected)}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
              setFocused(false)
              queueMicrotask(() => inputRef.current?.focus())
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
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // El cierre se maneja con mousedown fuera (permite clic en la lista portal).
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setFocused(false)
                setQuery('')
                return
              }

              if (!queryReady || filtered.length === 0) return

              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % filtered.length)
                return
              }

              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                const pick = filtered[activeIndex]
                if (pick) commitSelection(pick)
              }
            }}
            placeholder={placeholder}
            className={inputClass}
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
          />
          {dropdownPanel ? createPortal(dropdownPanel, document.body) : null}
        </>
      )}
    </div>
  )
}
