import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMonedaAnalista } from '../../lib/analista'
import { subscribeInsumos, type Insumo } from '../../lib/insumos'
import {
  buildFilasAuditoriaCostoRecetas,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'

function KpiCard({
  etiqueta,
  valor,
  ayuda,
  destacado = false,
}: {
  etiqueta: string
  valor: string
  ayuda: string
  destacado?: boolean
}) {
  return (
    <article
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        destacado ? 'border-[#CD1818]/20' : 'border-gray-200'
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
          destacado ? 'text-[#CD1818]' : 'text-[#8997A6]'
        }`}
      >
        {etiqueta}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-[#171717]">{valor}</p>
      <p className="mt-2 text-sm leading-relaxed text-[#8997A6]">{ayuda}</p>
    </article>
  )
}

function recetasSinPrecioCompleto(
  recetas: RecetaTecnica[],
  insumosById: Map<string, Insumo>,
): number {
  let count = 0
  for (const receta of recetas) {
    const tieneHueco = receta.ingredientes.some((ing) => {
      if (ing.insumoId) {
        const insumo = insumosById.get(ing.insumoId)
        return !insumo || insumo.costoPorUnidadBase <= 0
      }
      return ing.costoEstimado <= 0
    })
    if (tieneHueco) count += 1
  }
  return count
}

export function NutricionDashboardPage() {
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const unsubRecetas = subscribeRecetario((rows) => {
      setRecetas(rows)
      setCargando(false)
    })
    const unsubInsumos = subscribeInsumos(setInsumos)
    return () => {
      unsubRecetas()
      unsubInsumos()
    }
  }, [])

  const metricas = useMemo(() => {
    const filasCosto = buildFilasAuditoriaCostoRecetas(insumos, recetas)
    const insumosById = new Map(insumos.map((i) => [i.id, i]))
    const totalRecetas = recetas.length
    const costoPromedio =
      totalRecetas > 0
        ? filasCosto.reduce((acc, f) => acc + f.costoTeorico, 0) / totalRecetas
        : 0

    const ordenadas = [...filasCosto].sort((a, b) => b.costoTeorico - a.costoTeorico)
    const masCara = ordenadas[0] ?? null
    const masEconomica =
      ordenadas.length > 0 ? ordenadas[ordenadas.length - 1] : null

    const recetasConAlerta = recetasSinPrecioCompleto(recetas, insumosById)

    const topCostosas = ordenadas.slice(0, 5).map((fila) => {
      const receta = recetas.find((r) => r.id === fila.recetaId)
      const porciones = receta?.rendimientoPorciones ?? 1
      return {
        id: fila.recetaId,
        nombre: fila.nombre,
        costoLote: fila.costoTeorico,
        costoPorcion: porciones > 0 ? fila.costoTeorico / porciones : 0,
      }
    })

    return {
      totalRecetas,
      costoPromedio,
      masCara,
      masEconomica,
      recetasConAlerta,
      topCostosas,
    }
  }, [insumos, recetas])

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#CD1818]">
          Dashboard
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {cargando ? (
          <p className="text-sm text-[#8997A6]">Cargando recetario…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                etiqueta="Recetas activas"
                valor={String(metricas.totalRecetas)}
                ayuda="Fichas técnicas registradas en el recetario."
                destacado
              />
              <KpiCard
                etiqueta="Costo promedio lote"
                valor={formatMonedaAnalista(metricas.costoPromedio)}
                ayuda="Promedio del costo teórico por receta (insumos valorizados)."
              />
              <KpiCard
                etiqueta="Receta más cara"
                valor={
                  metricas.masCara
                    ? formatMonedaAnalista(metricas.masCara.costoTeorico)
                    : '—'
                }
                ayuda={
                  metricas.masCara
                    ? metricas.masCara.nombre
                    : 'Sin recetas cargadas.'
                }
              />
              <KpiCard
                etiqueta="Alertas de precio"
                valor={String(metricas.recetasConAlerta)}
                ayuda="Recetas con ingredientes sin insumo vinculado o sin costo."
                destacado={metricas.recetasConAlerta > 0}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-[#CD1818]">
                    Top 5 — mayor costo de lote
                  </h2>
                  <p className="mt-1 text-xs text-[#8997A6]">
                    Costo teórico según insumos del depósito.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                        <th className="px-4 py-3">Receta</th>
                        <th className="px-4 py-3 text-right">Lote</th>
                        <th className="px-4 py-3 text-right">Por porción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {metricas.topCostosas.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-10 text-center text-sm text-[#8997A6]"
                          >
                            Todavía no hay recetas para analizar.
                          </td>
                        </tr>
                      ) : (
                        metricas.topCostosas.map((fila) => (
                          <tr key={fila.id} className="hover:bg-neutral-50/80">
                            <td className="px-4 py-3 font-medium text-[#171717]">
                              {fila.nombre}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                              {formatMonedaAnalista(fila.costoLote)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#171717]">
                              {formatMonedaAnalista(fila.costoPorcion)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-[#CD1818]">
                    Accesos rápidos
                  </h2>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  <Link
                    to="/nutricion/recetario"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 transition hover:border-[#CD1818]/30 hover:bg-white"
                  >
                    <p className="text-sm font-semibold text-[#171717]">Recetario</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                      Crear y editar fichas técnicas con costos por ingrediente.
                    </p>
                  </Link>
                  <Link
                    to="/nutricion/ingenieria-menu"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 transition hover:border-[#CD1818]/30 hover:bg-white"
                  >
                    <p className="text-sm font-semibold text-[#171717]">
                      Ingeniería de menú
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                      Rankings de pedidos por plato, guarnición y lugar de entrega.
                    </p>
                  </Link>
                  <Link
                    to="/nutricion/planificacion"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 transition hover:border-[#CD1818]/30 hover:bg-white sm:col-span-2"
                  >
                    <p className="text-sm font-semibold text-[#171717]">
                      Planificación de menú
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                      Catálogo del menú cliente con costo por porción cuando hay
                      receta vinculada.
                    </p>
                  </Link>
                </div>
                {metricas.masEconomica && metricas.masEconomica.recetaId !== metricas.masCara?.recetaId ? (
                  <div className="border-t border-gray-100 px-5 py-4 text-sm text-[#8997A6]">
                    Receta más económica:{' '}
                    <span className="font-medium text-[#171717]">
                      {metricas.masEconomica.nombre}
                    </span>{' '}
                    ({formatMonedaAnalista(metricas.masEconomica.costoTeorico)} por lote)
                  </div>
                ) : null}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
