import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchPedidosPorRangoFecha,
  type PedidoHistorico,
} from '../../lib/menu'

function toInputDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultRangeStrings(): { inicio: string; fin: string } {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 6)
  return { inicio: toInputDateString(start), fin: toInputDateString(today) }
}

function parseInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

interface RankingFila {
  nombre: string
  cantidad: number
  porcentaje: number
}

const SELECCIONES_INVALIDAS = new Set([
  '',
  '-',
  '—',
  'null',
  '-- no pedir nada este día --',
  '-- sin guarnición --',
  'sin plato principal',
  'sin guarnicion',
  'sin guarnición',
])

function normalizarSeleccionReal(value: string): string | null {
  const limpio = value.trim()
  if (!limpio) return null
  return SELECCIONES_INVALIDAS.has(limpio.toLowerCase()) ? null : limpio
}

function normalizarLugarEntrega(value: string): string | null {
  const limpio = value.trim()
  return limpio ? limpio : null
}

function rankingDesdeMap(
  data: Map<string, number>,
  totalBase: number,
): RankingFila[] {
  const rows: RankingFila[] = [...data.entries()].map(([nombre, cantidad]) => ({
    nombre,
    cantidad,
    porcentaje: totalBase > 0 ? (cantidad / totalBase) * 100 : 0,
  }))

  rows.sort(
    (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'),
  )

  return rows
}

function topN(rows: RankingFila[], cantidad: number): RankingFila[] {
  return rows.slice(0, cantidad)
}

function bottomN(rows: RankingFila[], cantidad: number): RankingFila[] {
  return [...rows]
    .filter((row) => row.cantidad > 0)
    .sort((a, b) => a.cantidad - b.cantidad || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, cantidad)
}

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
      <p className="mt-3 text-3xl font-bold tracking-tight text-[#171717]">
        {valor}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#8997A6]">{ayuda}</p>
    </article>
  )
}

function RankingListCard({
  titulo,
  subtitulo,
  filas,
  vacío,
  variante = 'default',
}: {
  titulo: string
  subtitulo?: string
  filas: RankingFila[]
  vacío: string
  variante?: 'default' | 'alert'
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        variante === 'alert'
          ? 'border-[#CD1818]/20'
          : 'border-gray-200'
      }`}
    >
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-[#CD1818]">{titulo}</h2>
        {subtitulo ? (
          <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">{subtitulo}</p>
        ) : null}
      </div>
      <div className="px-5 py-4">
        {filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#8997A6]">{vacío}</p>
        ) : (
          <div className="space-y-4">
            {filas.map((row, i) => (
              <div key={`${row.nombre}-${i}`} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#171717]">{row.nombre}</p>
                    <p className="mt-0.5 text-xs text-[#8997A6]">
                      {row.cantidad} pedido{row.cantidad === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[#171717]">
                    {row.porcentaje.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      variante === 'alert' ? 'bg-[#CD1818]/45' : 'bg-[#CD1818]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(row.porcentaje, row.cantidad > 0 ? 6 : 0))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function LugarDistribucionCard({
  titulo,
  filas,
  vacío,
}: {
  titulo: string
  filas: RankingFila[]
  vacío: string
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-[#CD1818]">{titulo}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
          Participación sobre el total de pedidos válidos del período.
        </p>
      </div>
      <div className="px-5 py-4">
        {filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#8997A6]">{vacío}</p>
        ) : (
          <div className="space-y-4">
            {filas.map((row, i) => (
              <div key={`${row.nombre}-${i}`} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#171717]">{row.nombre}</p>
                    <p className="mt-0.5 text-xs text-[#8997A6]">
                      {row.cantidad} pedido{row.cantidad === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[#171717]">
                    {row.porcentaje.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#171717]"
                    style={{
                      width: `${Math.min(100, Math.max(row.porcentaje, row.cantidad > 0 ? 6 : 0))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function DashboardPage() {
  const defaults = useMemo(() => defaultRangeStrings(), [])
  const [fechaInicio, setFechaInicio] = useState(defaults.inicio)
  const [fechaFin, setFechaFin] = useState(defaults.fin)
  const [pedidos, setPedidos] = useState<PedidoHistorico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ini = parseInputDate(fechaInicio)
      const fin = parseInputDate(fechaFin)
      const data = await fetchPedidosPorRangoFecha(ini, fin)
      setPedidos(data)
    } catch (e) {
      setPedidos([])
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudieron cargar los pedidos. Verificá índices en Firestore.',
      )
    } finally {
      setLoading(false)
    }
  }, [fechaInicio, fechaFin])

  /* eslint-disable react-hooks/set-state-in-effect */
  // Necesitamos disparar la carga inicial/reload; aceptamos setState dentro del efecto.
  useEffect(() => {
    void cargar()
  }, [cargar])
  /* eslint-enable react-hooks/set-state-in-effect */

  const metricas = useMemo(() => {
    const totalViandas = pedidos.length
    const principales = new Map<string, number>()
    const guarniciones = new Map<string, number>()
    const lugares = new Map<string, number>()

    let totalPrincipalesReales = 0
    let totalGuarnicionesReales = 0

    for (const p of pedidos) {
      const principal = normalizarSeleccionReal(p.platoPrincipal)
      const guarnicion = normalizarSeleccionReal(p.guarnicion)
      const lugar = normalizarLugarEntrega(p.lugarEntrega)

      if (principal) {
        principales.set(principal, (principales.get(principal) ?? 0) + 1)
        totalPrincipalesReales += 1
      }

      if (guarnicion) {
        guarniciones.set(guarnicion, (guarniciones.get(guarnicion) ?? 0) + 1)
        totalGuarnicionesReales += 1
      }

      if (lugar) {
        lugares.set(lugar, (lugares.get(lugar) ?? 0) + 1)
      }
    }

    const totalSeleccionesReales = totalPrincipalesReales + totalGuarnicionesReales
    const rankingPrincipales = rankingDesdeMap(principales, totalPrincipalesReales)
    const rankingGuarniciones = rankingDesdeMap(guarniciones, totalGuarnicionesReales)
    const rankingLugares = rankingDesdeMap(lugares, totalViandas)

    const topPrincipales = topN(rankingPrincipales, 5)
    const bottomPrincipales = bottomN(rankingPrincipales, 5)
    const topGuarniciones = topN(rankingGuarniciones, 5)
    const masPopular = rankingPrincipales[0] ?? null
    const lugarMasActivo = rankingLugares[0] ?? null

    return {
      totalViandas,
      totalSeleccionesReales,
      totalPrincipalesReales,
      totalGuarnicionesReales,
      topPrincipales,
      bottomPrincipales,
      topGuarniciones,
      rankingLugares,
      masPopular,
      lugarMasActivo,
    }
  }, [pedidos])

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Dashboard — Ingeniería de menú
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Análisis por rango de fechas · Todos los pedidos (activos y archivados)
        </p>
        <div className="mt-3 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-8 overflow-auto p-4 sm:p-6 lg:p-8">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#8997A6]">
            Filtros de período
          </h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[160px] flex-1">
              <span className="text-xs font-medium text-[#8997A6]">
                Fecha inicio
              </span>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <label className="block min-w-[160px] flex-1">
              <span className="text-xs font-medium text-[#8997A6]">Fecha fin</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void cargar()}
              className="min-h-11 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50 sm:shrink-0"
            >
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#8997A6]">
            Se excluyen automáticamente selecciones vacías o inválidas como
            `-`, `null` o `-- No pedir nada este día --`. La participación de
            platos se calcula sólo sobre selecciones reales.
          </p>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-sm text-[#CD1818]"
          >
            {error}
          </div>
        ) : null}

        {loading && pedidos.length === 0 && !error ? (
          <p className="text-center text-sm text-[#8997A6]">Cargando datos…</p>
        ) : null}

        {!loading || pedidos.length > 0 ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                etiqueta="Total de viandas"
                valor={String(metricas.totalViandas)}
                ayuda="Pedidos totales del período filtrado."
                destacado
              />
              <KpiCard
                etiqueta="Selecciones reales"
                valor={String(metricas.totalSeleccionesReales)}
                ayuda={`${metricas.totalPrincipalesReales} principales + ${metricas.totalGuarnicionesReales} guarniciones válidas.`}
              />
              <KpiCard
                etiqueta="Plato estrella"
                valor={metricas.masPopular?.nombre ?? 'Sin datos'}
                ayuda={
                  metricas.masPopular
                    ? `${metricas.masPopular.cantidad} pedidos · ${metricas.masPopular.porcentaje.toFixed(1)}% de los principales reales.`
                    : 'No hubo platos principales reales en el período.'
                }
              />
              <KpiCard
                etiqueta="Sede con más pedidos"
                valor={metricas.lugarMasActivo?.nombre ?? 'Sin datos'}
                ayuda={
                  metricas.lugarMasActivo
                    ? `${metricas.lugarMasActivo.cantidad} pedidos · ${metricas.lugarMasActivo.porcentaje.toFixed(1)}% del total.`
                    : 'No hubo lugares de entrega válidos en el período.'
                }
              />
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <RankingListCard
                titulo="Top 5 Platos Principales"
                subtitulo="Participación sobre el total de platos principales reales."
                filas={metricas.topPrincipales}
                vacío="No hay platos principales reales registrados en el período."
              />
              <RankingListCard
                titulo="Top 5 Guarniciones"
                subtitulo="Participación sobre el total de guarniciones reales."
                filas={metricas.topGuarniciones}
                vacío="No hay guarniciones reales registradas en el período."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <RankingListCard
                titulo="Platos menos elegidos"
                subtitulo="Candidatos a rotación. Se excluyen selecciones vacías y no aparecen platos con 0 porque no tuvieron pedidos reales."
                filas={metricas.bottomPrincipales}
                vacío="No hay suficientes platos principales reales para calcular el bottom 5."
                variante="alert"
              />
              <LugarDistribucionCard
                titulo="Distribución por lugares de entrega"
                filas={metricas.rankingLugares}
                vacío="No hay datos de lugar de entrega en el período."
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
