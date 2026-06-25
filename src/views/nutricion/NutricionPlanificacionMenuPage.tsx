import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { formatMonedaAnalista } from '../../lib/analista'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import { subscribeMenu, type MenuItem } from '../../lib/menu'
import {
  buildFilasAuditoriaCostoRecetas,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'
import {
  exportarRecetaTecnicaPdf,
  exportarRecetarioLotePdf,
} from '../../lib/recetarioPdf'

const labelCategoria = (c: MenuItem['categoria']) =>
  c === 'principal' ? 'Plato principal' : 'Guarnición'

function normalizarNombre(s: string): string {
  return s.trim().toLocaleLowerCase('es')
}

function rutaRecetarioDesdeMenu(item: {
  nombre: string
  categoria: MenuItem['categoria']
  receta?: RecetaTecnica
  recetaPorNombre?: RecetaTecnica | null
}): string {
  const receta = item.receta ?? item.recetaPorNombre ?? null
  if (receta) {
    return `/nutricion/recetario?editar=${encodeURIComponent(receta.id)}`
  }
  const params = new URLSearchParams({
    nuevo: item.nombre,
    categoria: item.categoria,
  })
  return `/nutricion/recetario?${params.toString()}`
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  )
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V3" />
      <path d="m7 10 5 5 5-5" />
      <path d="M20 21H4" />
    </svg>
  )
}

export function NutricionPlanificacionMenuPage() {
  const { showToast } = useToast()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'principal' | 'guarnicion'>('todos')
  const [exportandoLote, setExportandoLote] = useState(false)

  useEffect(() => {
    const unsubMenu = subscribeMenu((rows) => {
      setMenuItems(rows)
      setCargando(false)
    })
    const unsubRecetas = subscribeRecetario(setRecetas)
    const unsubInsumos = subscribeInsumos(setInsumos)
    return () => {
      unsubMenu()
      unsubRecetas()
      unsubInsumos()
    }
  }, [])

  const recetasById = useMemo(
    () => new Map(recetas.map((r) => [r.id, r])),
    [recetas],
  )

  const recetasByNombre = useMemo(() => {
    const map = new Map<string, RecetaTecnica>()
    for (const receta of recetas) {
      map.set(normalizarNombre(receta.nombre), receta)
    }
    return map
  }, [recetas])

  const filas = useMemo(() => {
    const costosByRecetaId = new Map(
      buildFilasAuditoriaCostoRecetas(insumos, recetas).map((f) => [f.recetaId, f]),
    )

    return menuItems
      .filter((item) => filtro === 'todos' || item.categoria === filtro)
      .map((item) => {
        const recetaPorId = item.recetaId ? recetasById.get(item.recetaId) : undefined
        const recetaPorNombre = recetasByNombre.get(normalizarNombre(item.nombre))
        const receta = recetaPorId ?? recetaPorNombre
        const costo = receta ? costosByRecetaId.get(receta.id) : undefined
        const porciones = receta?.rendimientoPorciones ?? 0
        const costoVianda =
          costo && porciones > 0 ? costo.costoTeorico / porciones : null

        return {
          id: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          receta,
          recetaPorNombre,
          costoVianda,
          sinReceta: !receta,
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filtro, insumos, menuItems, recetas, recetasById, recetasByNombre])

  const recetasExportables = useMemo(() => {
    const seen = new Set<string>()
    const out: RecetaTecnica[] = []
    for (const fila of filas) {
      if (fila.receta && !seen.has(fila.receta.id)) {
        seen.add(fila.receta.id)
        out.push(fila.receta)
      }
    }
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filas])

  const resumen = useMemo(() => {
    const conReceta = filas.filter((f) => f.receta).length
    const conCosto = filas.filter((f) => f.costoVianda !== null && f.costoVianda > 0).length
    return { conReceta, conCosto, sinReceta: filas.length - conReceta }
  }, [filas])

  function handleDescargarReceta(receta: RecetaTecnica) {
    try {
      exportarRecetaTecnicaPdf(receta)
      showToast(`PDF generado: ${receta.nombre}`)
    } catch {
      showToast('No se pudo generar el PDF.', 'error')
    }
  }

  function handleDescargarLote() {
    if (recetasExportables.length === 0) {
      showToast('No hay fichas técnicas para exportar en este filtro.', 'error')
      return
    }
    setExportandoLote(true)
    try {
      const etiquetaFiltro =
        filtro === 'principal'
          ? 'Platos principales'
          : filtro === 'guarnicion'
            ? 'Guarniciones'
            : 'Menú completo'
      exportarRecetarioLotePdf(recetasExportables, {
        tituloPortada: `Planificación de menú — ${etiquetaFiltro}`,
      })
      showToast(
        `PDF con ${recetasExportables.length} ficha${recetasExportables.length === 1 ? '' : 's'} generado.`,
      )
    } catch {
      showToast('No se pudo generar el PDF.', 'error')
    } finally {
      setExportandoLote(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[#CD1818]">
              Planificación de menú
            </h1>
          </div>
          <button
            type="button"
            disabled={exportandoLote || recetasExportables.length === 0}
            onClick={handleDescargarLote}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-45"
          >
            <IconDownload className="h-4 w-4" />
            {exportandoLote
              ? 'Generando…'
              : `Descargar fichas PDF (${recetasExportables.length})`}
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {(
              [
                ['todos', 'Todos'],
                ['principal', 'Principales'],
                ['guarnicion', 'Guarniciones'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFiltro(value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  filtro === value
                    ? 'bg-[#CD1818] text-white shadow-sm'
                    : 'text-[#8997A6] hover:text-[#171717]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-[#8997A6]">
            {resumen.conReceta} con ficha · {resumen.conCosto} con costo ·{' '}
            {resumen.sinReceta} pendientes
          </p>
          <Link
            to="/nutricion/recetario"
            className="ml-auto text-sm font-semibold text-[#CD1818] hover:underline"
          >
            Ir al recetario →
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                  <th className="px-4 py-3">Plato / guarnición</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Ficha técnica</th>
                  <th className="px-4 py-3 text-right">Costo por vianda</th>
                  <th className="px-4 py-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#8997A6]">
                      Cargando menú…
                    </td>
                  </tr>
                ) : filas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#8997A6]">
                      No hay ítems en esta categoría.
                    </td>
                  </tr>
                ) : (
                  filas.map((fila) => {
                    const rutaRecetario = rutaRecetarioDesdeMenu({
                      nombre: fila.nombre,
                      categoria: fila.categoria,
                      receta: fila.receta,
                      recetaPorNombre: fila.recetaPorNombre,
                    })

                    return (
                    <tr key={fila.id} className="hover:bg-neutral-50/80">
                      <td className="px-4 py-3 font-medium text-[#171717]">{fila.nombre}</td>
                      <td className="px-4 py-3 text-[#171717]">
                        {labelCategoria(fila.categoria)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={rutaRecetario}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold transition hover:underline ${
                            fila.sinReceta ? 'text-amber-800' : 'text-[#CD1818]'
                          }`}
                        >
                          {fila.sinReceta ? 'Sin ficha técnica · Cargar' : 'Editar ficha'}
                          <IconArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                        {fila.costoVianda !== null && fila.costoVianda > 0 ? (
                          formatMonedaAnalista(fila.costoVianda)
                        ) : fila.sinReceta ? (
                          <span className="text-xs text-[#8997A6]">—</span>
                        ) : (
                          <span className="text-xs text-amber-700">Revisar insumos</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fila.receta ? (
                          <button
                            type="button"
                            onClick={() => handleDescargarReceta(fila.receta!)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-[#CD1818] transition hover:bg-gray-50"
                            title="Descargar ficha técnica (sin costos)"
                          >
                            <IconDownload className="h-3.5 w-3.5" />
                            PDF
                          </button>
                        ) : (
                          <span className="text-xs text-[#8997A6]">—</span>
                        )}
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
