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

function RankingTable({
  titulo,
  filas,
  vacío,
}: {
  titulo: string
  filas: RankingFila[]
  vacío: string
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-brand-muted/20 bg-brand-surface shadow-sm">
      <div className="bg-brand-accent px-4 py-3 text-sm font-semibold text-white">
        {titulo}
      </div>
      <div className="overflow-x-auto">
        {filas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-brand-muted">{vacío}</p>
        ) : (
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-brand-muted/15 bg-brand-muted/6 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="px-4 py-3">Nombre</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Cantidad</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Participación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-muted/10">
              {filas.map((row, i) => (
                <tr key={`${row.nombre}-${i}`} className="hover:bg-brand-muted/5">
                  <td className="px-4 py-2.5 font-medium text-brand-accent">
                    {row.nombre}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-brand-accent">
                    {row.cantidad}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-brand-accent">
                    {row.porcentaje.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    const total = pedidos.length
    const principales = new Map<string, number>()
    const guarniciones = new Map<string, number>()
    const lugares = new Map<string, number>()

    for (const p of pedidos) {
      principales.set(
        p.platoPrincipal,
        (principales.get(p.platoPrincipal) ?? 0) + 1,
      )
      guarniciones.set(p.guarnicion, (guarniciones.get(p.guarnicion) ?? 0) + 1)
      lugares.set(p.lugarEntrega, (lugares.get(p.lugarEntrega) ?? 0) + 1)
    }

    const rankingDesdeMap = (m: Map<string, number>): RankingFila[] => {
      const rows: RankingFila[] = [...m.entries()].map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        porcentaje: total > 0 ? (cantidad / total) * 100 : 0,
      }))
      rows.sort(
        (a, b) =>
          b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'),
      )
      return rows
    }

    const rankingPrincipales = rankingDesdeMap(principales)
    const rankingGuarniciones = rankingDesdeMap(guarniciones)
    const rankingLugares = rankingDesdeMap(lugares)

    const masPopular = rankingPrincipales[0] ?? null

    return {
      total,
      rankingPrincipales,
      rankingGuarniciones,
      rankingLugares,
      masPopular,
    }
  }, [pedidos])

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-brand-muted/15 bg-brand-surface px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-brand-accent">
          Dashboard — Ingeniería de menú
        </h1>
        <p className="mt-1 text-sm text-brand-muted">
          Análisis por rango de fechas · Todos los pedidos (activos y archivados)
        </p>
        <div className="mt-3 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-brand-accent underline-offset-2 hover:text-brand-muted hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-8 overflow-auto p-4 sm:p-6 lg:p-8">
        <section className="rounded-2xl border border-brand-muted/15 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-brand-muted">
            Filtros de período
          </h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block flex-1 min-w-[160px]">
              <span className="text-xs font-medium text-brand-muted">
                Fecha inicio
              </span>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15"
              />
            </label>
            <label className="block flex-1 min-w-[160px]">
              <span className="text-xs font-medium text-brand-muted">
                Fecha fin
              </span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void cargar()}
              className="min-h-11 rounded-xl bg-brand-accent px-5 text-sm font-semibold text-white shadow-md shadow-brand-accent/25 transition hover:brightness-105 disabled:opacity-50 sm:shrink-0"
            >
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
          <p className="mt-3 text-xs text-brand-muted">
            Por defecto: últimos 7 días (incluye hoy). La participación es sobre el
            total de pedidos del período (cada pedido = 1 vianda).
          </p>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-brand-accent/35 bg-brand-accent/5 px-4 py-3 text-sm text-brand-accent"
          >
            {error}
          </div>
        ) : null}

        {loading && pedidos.length === 0 && !error ? (
          <p className="text-center text-sm text-brand-muted">Cargando datos…</p>
        ) : null}

        {!loading || pedidos.length > 0 ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-brand-muted/20 bg-brand-accent p-5 text-white shadow-md shadow-brand-muted/15">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
                  Total en el período
                </p>
                <p className="mt-2 text-4xl font-bold tabular-nums">
                  {metricas.total}
                </p>
                <p className="mt-1 text-sm text-white/85">
                  Viandas vendidas / pedidas (un pedido = 1 vianda)
                </p>
              </div>
              <div className="rounded-2xl border border-brand-muted/20 bg-brand-surface p-5 shadow-md shadow-brand-muted/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  Plato principal más popular
                </p>
                {metricas.masPopular ? (
                  <>
                    <p className="mt-3 text-lg font-bold text-brand-accent">
                      {metricas.masPopular.nombre}
                    </p>
                    <p className="mt-1 text-sm text-brand-muted">
                      <span className="font-semibold tabular-nums text-brand-accent">
                        {metricas.masPopular.cantidad}
                      </span>{' '}
                      pedidos ·{' '}
                      <span className="font-semibold text-brand-accent">
                        {metricas.masPopular.porcentaje.toFixed(1)}%
                      </span>{' '}
                      del total
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-brand-muted">
                    Sin datos en este rango
                  </p>
                )}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <RankingTable
                titulo="Ranking — Platos principales"
                filas={metricas.rankingPrincipales}
                vacío="No hay platos principales registrados en el período."
              />
              <RankingTable
                titulo="Ranking — Guarniciones"
                filas={metricas.rankingGuarniciones}
                vacío="No hay guarniciones registradas en el período."
              />
            </div>

            <RankingTable
              titulo="Distribución — Lugares de entrega"
              filas={metricas.rankingLugares}
              vacío="No hay datos de lugar de entrega en el período."
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
