import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import type { Cama, EstadoCama } from '../../types/hoteleria'
import {
  crearCamasMasivoBatch,
  eliminarCamaNoOcupada,
  marcarCamaMantenimiento,
  subscribeCamas,
} from '../../lib/hoteleria'

type TabId = 'masivo' | 'gestion'

function sortCamasLista(rows: Cama[]): Cama[] {
  return [...rows].sort((a, b) => {
    const s = a.sector.localeCompare(b.sector, 'es', { numeric: true, sensitivity: 'base' })
    if (s !== 0) return s
    const h = a.habitacion.localeCompare(b.habitacion, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
    if (h !== 0) return h
    return a.denominacion.localeCompare(b.denominacion, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

const estadosEtiqueta: Record<EstadoCama, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  SUCIA: 'Sucia',
  MANTENIMIENTO: 'Mantenimiento',
}

export function ConfiguracionHoteleriaPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<TabId>('masivo')
  const [camas, setCamas] = useState<Cama[]>([])
  const [busy, setBusy] = useState(false)

  const [sector, setSector] = useState('')
  const [habitacion, setHabitacion] = useState('')
  const [denominaciones, setDenominaciones] = useState<string[]>([''])

  useEffect(() => {
    const unsub = subscribeCamas(setCamas)
    return () => unsub()
  }, [])

  const camasOrdenadas = useMemo(() => sortCamasLista(camas), [camas])

  function agregarFilaDenominacion() {
    setDenominaciones((prev) => [...prev, ''])
  }

  function quitarFilaDenominacion(index: number) {
    setDenominaciones((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)))
  }

  function setDenominacionEn(index: number, value: string) {
    setDenominaciones((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  async function guardarMasivo() {
    setBusy(true)
    try {
      const n = await crearCamasMasivoBatch({
        sector,
        habitacion,
        denominaciones,
      })
      showToast(`Se crearon ${n} camas en estado Libre.`, 'success')
      setSector('')
      setHabitacion('')
      setDenominaciones([''])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function ponerMantenimiento(camaId: string) {
    setBusy(true)
    try {
      await marcarCamaMantenimiento(camaId, true)
      showToast('Cama en mantenimiento.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function sacarMantenimiento(camaId: string) {
    setBusy(true)
    try {
      await marcarCamaMantenimiento(camaId, false)
      showToast('Cama disponible.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function eliminar(c: Cama) {
    if (c.estado === 'OCUPADA') {
      showToast('No se puede eliminar una cama ocupada.', 'error')
      return
    }
    if (
      !window.confirm(
        `¿Eliminar la cama «${c.denominacion}» (${c.sector} · ${c.habitacion})? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await eliminarCamaNoOcupada(c.id)
      showToast('Cama eliminada.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const tabBtn =
    'min-h-10 flex-1 rounded-lg px-3 text-sm font-medium transition sm:flex-none sm:px-5'

  return (
    <div className="flex min-h-full w-full flex-col bg-neutral-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('masivo')}
            className={`${tabBtn} ${
              tab === 'masivo'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Generador masivo de camas
          </button>
          <button
            type="button"
            onClick={() => setTab('gestion')}
            className={`${tabBtn} ${
              tab === 'gestion'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Gestión de estado
          </button>
        </div>

        {tab === 'masivo' ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Sector</span>
                <input
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Ej. Nave A"
                  className="mt-1 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Habitación</span>
                <input
                  value={habitacion}
                  onChange={(e) => setHabitacion(e.target.value)}
                  placeholder="Ej. A-101"
                  className="mt-1 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-neutral-600">
                  Denominaciones de camas
                </span>
                <button
                  type="button"
                  onClick={agregarFilaDenominacion}
                  className="text-sm font-medium text-orange-700 hover:text-orange-900"
                >
                  + Agregar
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {denominaciones.map((den, i) => (
                  <li key={i} className="flex gap-2">
                    <input
                      value={den}
                      onChange={(e) => setDenominacionEn(i, e.target.value)}
                      placeholder={`Ej. ${i === 0 ? 'Baja 1' : 'Alta 1'}`}
                      className="min-h-10 flex-1 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => quitarFilaDenominacion(i)}
                      className="shrink-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-50"
                      aria-label="Quitar fila"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => void guardarMasivo()}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? 'Guardando…' : 'Guardar camas'}
              </button>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Sector</th>
                    <th className="px-4 py-3">Habitación</th>
                    <th className="px-4 py-3">Cama</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {camasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                        No hay camas. Usá la pestaña de generador masivo.
                      </td>
                    </tr>
                  ) : (
                    camasOrdenadas.map((c) => (
                      <tr key={c.id} className="hover:bg-neutral-50/80">
                        <td className="whitespace-nowrap px-4 py-3">{c.sector}</td>
                        <td className="whitespace-nowrap px-4 py-3">{c.habitacion}</td>
                        <td className="px-4 py-3 font-medium">{c.denominacion}</td>
                        <td className="px-4 py-3">{estadosEtiqueta[c.estado]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {c.estado !== 'MANTENIMIENTO' && c.estado !== 'OCUPADA' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void ponerMantenimiento(c.id)}
                                className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Mantenimiento
                              </button>
                            ) : null}
                            {c.estado === 'MANTENIMIENTO' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void sacarMantenimiento(c.id)}
                                className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Disponible
                              </button>
                            ) : null}
                            {c.estado !== 'OCUPADA' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void eliminar(c)}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                              >
                                Eliminar
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-400">Ocupada</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
