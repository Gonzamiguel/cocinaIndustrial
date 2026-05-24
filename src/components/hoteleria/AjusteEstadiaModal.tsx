import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Cama, PadronPersona } from '../../types/hoteleria'
import type { RegistroAjusteEstadia } from '../../types/ajusteEstadia'
import { etiquetaCamaDesdeId, resolverCamaIdPorTexto } from '../../lib/hoteleria'

const inputClass =
  'mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 text-sm text-neutral-900 outline-none transition focus:border-[#CD1818]/40 focus:bg-white focus:ring-2 focus:ring-[#CD1818]/15'

const labelClass = 'text-xs font-medium text-neutral-600'

export type AjusteEstadiaModalProps = {
  open: boolean
  registro: RegistroAjusteEstadia | null
  padron: PadronPersona[]
  camas: Cama[]
  onClose: () => void
  onSave: (payload: RegistroAjusteEstadia) => void
  saving?: boolean
}

function toDatetimeLocalValue(d: Date | null): string {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function ahoraDatetimeLocal(): string {
  return toDatetimeLocalValue(new Date())
}

export function AjusteEstadiaModal({
  open,
  registro,
  padron,
  camas,
  onClose,
  onSave,
  saving = false,
}: AjusteEstadiaModalProps) {
  const esEdicion = Boolean(registro?.historialId)

  const [busquedaPersona, setBusquedaPersona] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [personaSel, setPersonaSel] = useState<PadronPersona | null>(null)
  const [fechaCheckIn, setFechaCheckIn] = useState('')
  const [fechaCheckOut, setFechaCheckOut] = useState('')
  const [habitacionCama, setHabitacionCama] = useState('')
  const [camaId, setCamaId] = useState('')

  useEffect(() => {
    if (!open) return
    if (registro) {
      setBusquedaPersona(
        registro.persona
          ? `${registro.persona.dni} — ${registro.persona.apellido}, ${registro.persona.nombre}`
          : '',
      )
      setPersonaId(registro.personaId)
      setPersonaSel(registro.persona)
      setFechaCheckIn(registro.fechaCheckIn || ahoraDatetimeLocal())
      setFechaCheckOut(registro.fechaCheckOut)
      setHabitacionCama(registro.habitacionCama)
      setCamaId(registro.camaId)
    } else {
      setBusquedaPersona('')
      setPersonaId('')
      setPersonaSel(null)
      setFechaCheckIn(ahoraDatetimeLocal())
      setFechaCheckOut('')
      setHabitacionCama('')
      setCamaId('')
    }
  }, [open, registro])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const opcionesCama = useMemo(
    () =>
      camas.map((c) => ({
        id: c.id,
        label: `${c.sector} · ${c.habitacion} · ${c.denominacion}`,
      })),
    [camas],
  )

  const sugerenciasPersona = useMemo(() => {
    const q = busquedaPersona.trim().toLowerCase()
    if (!q || personaSel) return []
    return padron
      .filter((p) => {
        const blob = `${p.dni} ${p.nombre} ${p.apellido} ${p.empresa}`.toLowerCase()
        return blob.includes(q)
      })
      .slice(0, 8)
  }, [busquedaPersona, padron, personaSel])

  function elegirPersona(p: PadronPersona) {
    setPersonaSel(p)
    setPersonaId(p.id)
    setBusquedaPersona(`${p.dni} — ${p.apellido}, ${p.nombre}`)
  }

  function limpiarPersona() {
    setPersonaSel(null)
    setPersonaId('')
    setBusquedaPersona('')
  }

  function onChangeHabitacion(val: string) {
    setHabitacionCama(val)
    const id = resolverCamaIdPorTexto(val, camas)
    setCamaId(id)
  }

  function onSelectCamaLista(label: string) {
    const item = opcionesCama.find((o) => o.label === label)
    if (item) {
      setHabitacionCama(item.label)
      setCamaId(item.id)
    }
  }

  function handleSubmit() {
    if (!personaId || !personaSel) return
    const resolvedCamaId = camaId || resolverCamaIdPorTexto(habitacionCama, camas)
    onSave({
      historialId: registro?.historialId ?? null,
      personaId,
      persona: personaSel,
      fechaCheckIn,
      fechaCheckOut,
      habitacionCama: habitacionCama.trim() || etiquetaCamaDesdeId(resolvedCamaId, camas),
      camaId: resolvedCamaId,
    })
  }

  if (!open) return null

  const puedeGuardar = Boolean(
    personaId &&
      personaSel &&
      fechaCheckIn.trim() &&
      fechaCheckOut.trim() &&
      (camaId || habitacionCama.trim()),
  )

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {esEdicion ? 'Editar estadía' : 'Ajustar estadía'}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Corrección manual de pernocte en el historial (check-in / check-out).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className={labelClass}>
              Persona (DNI / nombre) <span className="text-[#CD1818]">*</span>
            </span>
            <input
              type="search"
              value={busquedaPersona}
              onChange={(e) => {
                setBusquedaPersona(e.target.value)
                if (personaSel) limpiarPersona()
              }}
              disabled={esEdicion}
              className={`${inputClass} ${esEdicion ? 'cursor-not-allowed opacity-70' : ''}`}
              placeholder="Buscar en el padrón…"
              autoComplete="off"
            />
            {esEdicion ? (
              <p className="mt-1 text-xs text-neutral-400">La persona no se modifica al editar.</p>
            ) : null}
            {!esEdicion && sugerenciasPersona.length > 0 ? (
              <ul className="mt-1 max-h-40 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                {sugerenciasPersona.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[#CD1818]/5"
                      onClick={() => elegirPersona(p)}
                    >
                      <span className="font-mono text-xs text-neutral-600">{p.dni}</span>
                      <span className="ml-2 font-medium text-neutral-900">
                        {p.apellido}, {p.nombre}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

          <label className="block">
            <span className={labelClass}>
              Fecha de ingreso (check-in) <span className="text-[#CD1818]">*</span>
            </span>
            <input
              type="datetime-local"
              value={fechaCheckIn}
              onChange={(e) => setFechaCheckIn(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="block">
            <label htmlFor="fecha-egreso-planificada" className={labelClass}>
              Fecha de Egreso Planificada <span className="text-[#CD1818]">*</span>
            </label>
            <input
              id="fecha-egreso-planificada"
              type="datetime-local"
              value={fechaCheckOut}
              onChange={(e) => setFechaCheckOut(e.target.value)}
              required
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              Indica la fecha en la que finaliza su turno o baja del campamento.
            </p>
          </div>

          <label className="block">
            <span className={labelClass}>
              Habitación / cama <span className="text-[#CD1818]">*</span>
            </span>
            <input
              type="text"
              list="camas-ajuste-datalist"
              value={habitacionCama}
              onChange={(e) => onChangeHabitacion(e.target.value)}
              onBlur={(e) => onSelectCamaLista(e.target.value)}
              className={inputClass}
              placeholder="Ej. Sector A · Hab. 12 · Cama 3"
            />
            <datalist id="camas-ajuste-datalist">
              {opcionesCama.map((o) => (
                <option key={o.id} value={o.label} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !puedeGuardar}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              'Guardar ajuste'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export { toDatetimeLocalValue }
