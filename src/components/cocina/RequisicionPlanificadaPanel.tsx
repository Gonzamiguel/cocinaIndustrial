import { useEffect, useMemo, useState } from 'react'
import {
  formatYmdLocal,
  getProximaSemanaLaborable,
} from '../../lib/fechasDinamicas'
import {
  consolidarIngredientesPlanificados,
  itemsSolicitudDesdeExplosion,
  type LineaPlanProduccion,
} from '../../lib/requisicionPlanificada'
import type { RecetaTecnica } from '../../lib/recetario'
import type { Insumo } from '../../lib/insumos'
import type { ItemSolicitudMercaderia } from '../../lib/solicitudesMercaderia'
import { exportarPdfInsumosPlanProduccion } from '../../lib/planificacionProduccionPdf'
import type { LineaPlanProduccionGuardada } from '../../lib/planificacionProduccionCocina'
import { useToast } from '../../context/ToastContext'

type AlcancePlan = 'semana' | 'dia'

function nuevaKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random())
}

function lineaVacia(fechaYmd: string): LineaPlanDraft {
  return { key: nuevaKey(), fechaYmd, recetaId: '', porciones: '' }
}

type LineaPlanDraft = {
  key: string
  fechaYmd: string
  recetaId: string
  porciones: string
}

export type SnapshotPlanProduccion = {
  semanaInicioYmd: string
  semanaFinYmd: string
  lineas: LineaPlanProduccion[]
  lineasGuardadas: LineaPlanProduccionGuardada[]
}

type RequisicionPlanificadaPanelProps = {
  recetas: RecetaTecnica[]
  insumos: Insumo[]
  embedded?: boolean
  onItemsChange: (items: ItemSolicitudMercaderia[]) => void
  onPlanSnapshot?: (snap: SnapshotPlanProduccion) => void
}

export function RequisicionPlanificadaPanel({
  recetas,
  insumos,
  embedded = false,
  onItemsChange,
  onPlanSnapshot,
}: RequisicionPlanificadaPanelProps) {
  const { showToast } = useToast()
  const semanaInicial = useMemo(() => getProximaSemanaLaborable(), [])
  const [alcance, setAlcance] = useState<AlcancePlan>('semana')
  const [fechaDia, setFechaDia] = useState(formatYmdLocal(new Date()))
  const [lineas, setLineas] = useState<LineaPlanDraft[]>(() =>
    semanaInicial.dias.map((d) => lineaVacia(formatYmdLocal(d.fecha))),
  )

  const recetasOrdenadas = useMemo(
    () => [...recetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [recetas],
  )

  const recetasById = useMemo(() => {
    const m = new Map<string, RecetaTecnica>()
    for (const r of recetas) m.set(r.id, r)
    return m
  }, [recetas])

  const insumosById = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  useEffect(() => {
    if (alcance !== 'semana') return
    setLineas(semanaInicial.dias.map((d) => lineaVacia(formatYmdLocal(d.fecha))))
  }, [alcance, semanaInicial])

  useEffect(() => {
    if (alcance !== 'dia') return
    setLineas([lineaVacia(fechaDia)])
  }, [alcance, fechaDia])

  const lineasNumericas: LineaPlanProduccion[] = useMemo(
    () =>
      lineas
        .map((l) => ({
          key: l.key,
          fechaYmd: l.fechaYmd,
          recetaId: l.recetaId,
          porciones: Number(String(l.porciones).replace(',', '.')),
        }))
        .filter((l) => l.recetaId && Number.isFinite(l.porciones) && l.porciones > 0),
    [lineas],
  )

  const explosion = useMemo(
    () => consolidarIngredientesPlanificados(lineasNumericas, recetasById, insumosById),
    [lineasNumericas, recetasById, insumosById],
  )

  const items = useMemo(() => itemsSolicitudDesdeExplosion(explosion), [explosion])

  useEffect(() => {
    onItemsChange(items)
  }, [items, onItemsChange])

  const semanaFinYmd =
    alcance === 'semana'
      ? semanaInicial.viernesYmd
      : fechaDia
  const semanaInicioYmd =
    alcance === 'semana' ? semanaInicial.lunesYmd : fechaDia

  useEffect(() => {
    if (!onPlanSnapshot) return
    const lineasGuardadas: LineaPlanProduccionGuardada[] = lineasNumericas.map((l) => {
      const r = recetasById.get(l.recetaId)
      return {
        fechaYmd: l.fechaYmd,
        recetaId: l.recetaId,
        recetaNombre: r?.nombre ?? '',
        recetaCodigo: r?.codigoCorto ?? '',
        categoria: r?.categoria ?? '',
        porciones: l.porciones,
      }
    })
    onPlanSnapshot({
      semanaInicioYmd,
      semanaFinYmd,
      lineas: lineasNumericas,
      lineasGuardadas,
    })
  }, [lineasNumericas, onPlanSnapshot, recetasById, semanaFinYmd, semanaInicioYmd])

  function actualizarLinea(key: string, patch: Partial<LineaPlanDraft>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const boxClass = embedded
    ? 'rounded-lg border border-neutral-200 bg-white p-4'
    : 'rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7'

  const lineasPorDia = useMemo(() => {
    const m = new Map<string, LineaPlanDraft[]>()
    for (const l of lineas) {
      const arr = m.get(l.fechaYmd) ?? []
      arr.push(l)
      m.set(l.fechaYmd, arr)
    }
    return m
  }, [lineas])

  const fechasMostrar =
    alcance === 'semana'
      ? semanaInicial.dias.map((d) => formatYmdLocal(d.fecha))
      : [fechaDia]

  return (
    <div className="space-y-6">
      <div className={boxClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
          Planificada por producción
        </p>
        <p className="mt-1 text-sm text-[#8997A6]">
          Proyectá porciones objetivo por receta. El sistema multiplica ingredientes (merma y
          rendimiento) y arma la solicitud consolidada para depósito.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAlcance('semana')}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${
              alcance === 'semana'
                ? 'bg-[#CD1818] text-white'
                : 'border border-gray-200 bg-white text-[#171717]'
            }`}
          >
            Semana (lun–vie)
          </button>
          <button
            type="button"
            onClick={() => setAlcance('dia')}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${
              alcance === 'dia'
                ? 'bg-[#CD1818] text-white'
                : 'border border-gray-200 bg-white text-[#171717]'
            }`}
          >
            Un día
          </button>
        </div>
        {alcance === 'semana' ? (
          <p className="mt-3 text-xs text-[#8997A6]">
            Próxima semana laborable: {semanaInicial.lunesYmd} → {semanaInicial.viernesYmd}
          </p>
        ) : (
          <label className="mt-4 block max-w-xs text-sm font-medium text-[#171717]">
            Día de producción
            <input
              type="date"
              value={fechaDia}
              onChange={(e) => setFechaDia(e.target.value)}
              className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 px-3 text-sm"
            />
          </label>
        )}
      </div>

      {fechasMostrar.map((ymd) => {
        const dia = semanaInicial.dias.find((d) => formatYmdLocal(d.fecha) === ymd)
        const filasDia = lineasPorDia.get(ymd) ?? []
        return (
          <div key={ymd} className={boxClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#171717]">
                {dia?.fechaConsumo ?? ymd}
              </p>
              <button
                type="button"
                onClick={() => setLineas((prev) => [...prev, lineaVacia(ymd)])}
                className="text-sm font-semibold text-[#CD1818]"
              >
                + Agregar receta
              </button>
            </div>
            <div className="space-y-3">
              {filasDia.map((fila) => (
                <div
                  key={fila.key}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                >
                  <select
                    value={fila.recetaId}
                    onChange={(e) => actualizarLinea(fila.key, { recetaId: e.target.value })}
                    className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">— Receta —</option>
                    {recetasOrdenadas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.codigoCorto ? `${r.codigoCorto} · ` : ''}
                        {r.nombre} ({r.rendimientoPorciones} porc. ficha)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={fila.porciones}
                    onChange={(e) => actualizarLinea(fila.key, { porciones: e.target.value })}
                    placeholder="Porciones"
                    className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLineas((prev) => {
                        const rest = prev.filter((l) => l.key !== fila.key)
                        return rest.some((l) => l.fechaYmd === ymd)
                          ? rest
                          : [...rest, lineaVacia(ymd)]
                      })
                    }
                    className="min-h-11 text-sm font-medium text-[#8997A6] hover:text-[#CD1818]"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className={boxClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
            Solicitud consolidada (depósito)
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                exportarPdfInsumosPlanProduccion({
                  semanaInicioYmd,
                  semanaFinYmd,
                  lineas: lineasNumericas,
                  recetasById,
                  insumosById,
                })
                showToast('PDF de insumos generado.')
              } catch (err) {
                showToast(
                  err instanceof Error ? err.message : 'No se pudo generar el PDF.',
                  'error',
                )
              }
            }}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] hover:border-[#CD1818]/30 hover:text-[#CD1818]"
          >
            Descargar PDF de insumos
          </button>
        </div>
        {explosion.length === 0 ? (
          <p className="mt-2 text-sm text-[#8997A6]">
            Cargá recetas y porciones para ver el explosionado de insumos.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase text-[#8997A6]">
                  <th className="py-2 pr-3">Insumo</th>
                  <th className="py-2 pr-3 text-right">Cantidad</th>
                  <th className="py-2 pr-3">Unidad</th>
                  <th className="py-2">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {explosion.map((f) => (
                  <tr key={`${f.insumoId ?? f.producto}-${f.unidadMedida}`}>
                    <td className="py-2 pr-3 font-medium text-[#171717]">{f.producto}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-2 pr-3">{f.unidadMedida}</td>
                    <td className="py-2 text-xs text-[#8997A6]">{f.origen.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
