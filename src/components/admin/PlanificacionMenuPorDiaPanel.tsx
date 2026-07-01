import { useMemo, useState } from 'react'
import { formatEtiquetaPestaña, parseYmdLocal } from '../../lib/fechasDinamicas'
import type { MenuItem } from '../../lib/menu'
import type {
  PlanificacionDiaMenuEmpresa,
  PlanificacionOpcionMenu,
} from '../../types/planificacionMenuEmpresa'

const TAB_ACTIVO = 'bg-[#CD1818] text-white shadow-sm ring-1 ring-[#CD1818]/30'
const TAB_INACTIVO =
  'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
const TAB_CON_OPCIONES =
  'bg-gray-50 text-[#171717] ring-1 ring-emerald-200 hover:bg-emerald-50/50'

type BuscadorProps = {
  titulo: string
  placeholder: string
  items: MenuItem[]
  seleccionadas: PlanificacionOpcionMenu[]
  onAgregar: (menuId: string, nombre: string) => void
  onQuitar: (menuId: string) => void
  vacioSeleccion: string
}

function BuscadorAgregarOpciones({
  titulo,
  placeholder,
  items,
  seleccionadas,
  onAgregar,
  onQuitar,
  vacioSeleccion,
}: BuscadorProps) {
  const [busqueda, setBusqueda] = useState('')
  const idsSeleccionados = useMemo(
    () => new Set(seleccionadas.map((o) => o.menuId)),
    [seleccionadas],
  )

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return items
      .filter((item) => !idsSeleccionados.has(item.id))
      .filter((item) => item.nombre.toLowerCase().includes(q))
      .slice(0, 15)
  }, [busqueda, items, idsSeleccionados])

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
      <h3 className="text-sm font-semibold text-[#171717]">{titulo}</h3>
      <p className="mt-0.5 text-xs text-[#8997A6]">
        Escribí al menos 2 letras para buscar y agregar con un clic.
      </p>

      <div className="mt-3 flex min-h-[2.25rem] flex-wrap gap-2">
        {seleccionadas.length === 0 ? (
          <span className="text-xs italic text-[#8997A6]">{vacioSeleccion}</span>
        ) : (
          seleccionadas.map((o) => (
            <span
              key={o.menuId}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1.5 text-xs font-medium text-[#171717] ring-1 ring-gray-200"
            >
              <span className="truncate">{o.nombre}</span>
              <button
                type="button"
                onClick={() => onQuitar(o.menuId)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#8997A6] transition hover:bg-[#CD1818]/10 hover:text-[#CD1818]"
                aria-label={`Quitar ${o.nombre}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative mt-3">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
          autoComplete="off"
        />
        {busqueda.trim().length >= 2 ? (
          <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {resultados.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#8997A6]">Sin coincidencias.</p>
            ) : (
              resultados.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onAgregar(item.id, item.nombre)
                    setBusqueda('')
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[#171717] hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate">{item.nombre}</span>
                  <span className="shrink-0 text-xs text-[#8997A6]">stock {item.stock}</span>
                </button>
              ))
            )}
          </div>
        ) : busqueda.length > 0 ? (
          <p className="mt-1 text-[11px] text-[#8997A6]">Escribí un poco más para buscar…</p>
        ) : null}
      </div>
    </div>
  )
}

type PanelProps = {
  dias: PlanificacionDiaMenuEmpresa[]
  principales: MenuItem[]
  guarniciones: MenuItem[]
  cargando?: boolean
  onAgregarOpcion: (
    diaIndex: number,
    tipo: 'principal' | 'guarnicion',
    menuId: string,
    nombre: string,
  ) => void
  onQuitarOpcion: (
    diaIndex: number,
    tipo: 'principal' | 'guarnicion',
    menuId: string,
  ) => void
  onObservaciones: (diaIndex: number, observaciones: string) => void
}

export function PlanificacionMenuPorDiaPanel({
  dias,
  principales,
  guarniciones,
  cargando = false,
  onAgregarOpcion,
  onQuitarOpcion,
  onObservaciones,
}: PanelProps) {
  const [diaActivo, setDiaActivo] = useState(0)
  const indiceSeguro = Math.min(Math.max(0, diaActivo), Math.max(0, dias.length - 1))
  const dia = dias[indiceSeguro]

  function conteoOpciones(d: PlanificacionDiaMenuEmpresa): number {
    return d.opcionesPrincipales.length + d.opcionesGuarniciones.length
  }

  if (cargando) {
    return <p className="p-5 text-sm text-[#8997A6]">Cargando…</p>
  }

  if (!dia) {
    return <p className="p-5 text-sm text-[#8997A6]">No hay días en esta semana.</p>
  }

  return (
    <div className="p-4 md:p-5">
      <div
        role="tablist"
        aria-label="Días de la semana"
        className="flex flex-wrap gap-2"
      >
        {dias.map((d, idx) => {
          const activo = idx === indiceSeguro
          const tieneOpciones = conteoOpciones(d) > 0
          const fecha = parseYmdLocal(d.fechaYmd)
          const tabClass = activo
            ? TAB_ACTIVO
            : tieneOpciones
              ? TAB_CON_OPCIONES
              : TAB_INACTIVO
          return (
            <button
              key={d.fechaYmd}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setDiaActivo(idx)}
              className={`flex min-h-11 min-w-[4.5rem] flex-1 flex-col items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition sm:max-w-[5.5rem] ${tabClass}`}
            >
              <span>{formatEtiquetaPestaña(fecha)}</span>
              {tieneOpciones ? (
                <span
                  className={`mt-0.5 text-[10px] font-medium ${activo ? 'text-white/90' : 'text-emerald-700'}`}
                >
                  {conteoOpciones(d)} opc.
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        className="mt-5 space-y-4 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm md:p-5"
      >
        <div>
          <h3 className="text-base font-semibold text-[#171717]">{dia.fechaConsumo}</h3>
          <p className="mt-0.5 text-xs text-[#8997A6]">
            Agregá las opciones que verán los empleados este día.
          </p>
        </div>

        <BuscadorAgregarOpciones
          titulo="Platos principales"
          placeholder="Buscar plato principal…"
          items={principales}
          seleccionadas={dia.opcionesPrincipales}
          onAgregar={(id, nombre) => onAgregarOpcion(indiceSeguro, 'principal', id, nombre)}
          onQuitar={(id) => onQuitarOpcion(indiceSeguro, 'principal', id)}
          vacioSeleccion="Aún no agregaste platos principales."
        />

        <BuscadorAgregarOpciones
          titulo="Guarniciones"
          placeholder="Buscar guarnición…"
          items={guarniciones}
          seleccionadas={dia.opcionesGuarniciones}
          onAgregar={(id, nombre) => onAgregarOpcion(indiceSeguro, 'guarnicion', id, nombre)}
          onQuitar={(id) => onQuitarOpcion(indiceSeguro, 'guarnicion', id)}
          vacioSeleccion="Aún no agregaste guarniciones."
        />

        <label className="block text-left">
          <span className="text-xs font-medium text-[#8997A6]">
            Observaciones del día (opcional)
          </span>
          <input
            type="text"
            value={dia.observaciones ?? ''}
            onChange={(e) => onObservaciones(indiceSeguro, e.target.value)}
            className="mt-1 w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
            placeholder="Ej. Menú especial, horario de corte…"
          />
        </label>
      </div>
    </div>
  )
}
