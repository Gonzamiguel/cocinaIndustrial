import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProveedorPadron } from '../../lib/proveedoresPadron'

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 15

function etiquetaProveedor(p: ProveedorPadron): string {
  return p.cuit ? `${p.razonSocial} · CUIT ${p.cuit}` : p.razonSocial
}

type Props = {
  proveedores: ProveedorPadron[]
  selectedId: string | null
  selectedLabel?: string
  onSelect: (proveedor: ProveedorPadron) => void
  onClear: () => void
  disabled?: boolean
  placeholder?: string
}

type DropdownRect = { top: number; left: number; width: number }

export function ProveedorSearchSelect({
  proveedores,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  disabled,
  placeholder = 'Escribí razón social o CUIT…',
}: Props) {
  const listboxId = useId()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedId
    ? proveedores.find((p) => p.id === selectedId)
    : undefined

  const displayText =
    selected != null ? etiquetaProveedor(selected) : selectedLabel?.trim() || ''

  const trimmedQuery = query.trim()
  const queryReady = trimmedQuery.length >= MIN_QUERY_LENGTH

  const filtered = useMemo(() => {
    if (!queryReady) return []
    const q = trimmedQuery.toLowerCase()
    const matches: ProveedorPadron[] = []
    for (const p of proveedores) {
      const blob = `${p.razonSocial} ${p.nombre} ${p.cuit} ${p.codigoInterno}`.toLowerCase()
      if (blob.includes(q)) {
        matches.push(p)
        if (matches.length >= MAX_RESULTS) break
      }
    }
    return matches
  }, [proveedores, trimmedQuery, queryReady])

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

  function commitSelection(proveedor: ProveedorPadron) {
    onSelect(proveedor)
    setQuery('')
    setFocused(false)
    setActiveIndex(0)
  }

  const inputClass =
    'mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/10 disabled:opacity-50'

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
        className="max-h-52 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
      >
        {!queryReady ? (
          <li className="px-4 py-2.5 text-sm text-neutral-500">
            Escribí al menos {MIN_QUERY_LENGTH} caracteres para buscar.
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-4 py-2.5 text-sm text-neutral-500">No hay coincidencias.</li>
        ) : (
          filtered.map((p, idx) => (
            <li key={p.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-neutral-50 ${
                  idx === activeIndex ? 'bg-[#CD1818]/8 text-neutral-900' : 'text-neutral-900'
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitSelection(p)}
              >
                <span className="font-medium">{p.razonSocial}</span>
                {p.cuit ? (
                  <span className="ml-2 text-xs text-neutral-500">CUIT {p.cuit}</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null

  if (disabled) {
    return (
      <div className={`${inputClass} flex items-center`}>{displayText || '—'}</div>
    )
  }

  return (
    <div ref={wrapRef} className="relative min-w-0">
      {selectedId && selected ? (
        <div className="mt-1.5 flex flex-wrap items-stretch gap-2">
          <div className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-900">
            <span className="line-clamp-2">{etiquetaProveedor(selected)}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
              setFocused(false)
              queueMicrotask(() => inputRef.current?.focus())
            }}
            className="min-h-11 shrink-0 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-500 transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
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
