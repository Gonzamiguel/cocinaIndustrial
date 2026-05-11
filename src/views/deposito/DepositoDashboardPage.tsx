import { useEffect, useMemo, useState } from 'react'
import {
  subscribeMovimientosInventario,
  movimientosEnUbicacion,
  UBICACION_DEPOSITO_CENTRAL,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'

type LoteResumen = {
  insumoId: string
  lote: string
  fechaVencimiento: string | null
  stock: number
}

type LoteCritico = {
  insumoId: string
  insumoLabel: string
  lote: string
  fechaVencimiento: string
  stock: number
  unidadBase: string
  diasRestantes: number
}

type FilaSinRotacion = {
  insumoId: string
  insumoLabel: string
  stockActual: number
  unidadBase: string
  ultimaSalida: Date | null
  ultimaEntrada: Date | null
}

function getDeltaMovimiento(
  tipo: MovimientoInventario['tipo'],
  cantidad: number,
): number {
  if (tipo === 'INGRESO') return Math.abs(cantidad)
  if (tipo === 'EGRESO' || tipo === 'DECOMISO') return -Math.abs(cantidad)
  return cantidad
}

function parseFechaIso(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isFinite(date.getTime()) ? date : null
}

function formatFecha(value: Date | null): string {
  if (!value) return 'Sin fecha'
  return value.toLocaleDateString('es-AR')
}

function formatFechaIso(value: string | null): string {
  const parsed = parseFechaIso(value)
  return parsed ? parsed.toLocaleDateString('es-AR') : 'Sin fecha'
}

function formatCantidad(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function formatCantidadUnidad(value: number, unidadBase: string): string {
  return `${formatCantidad(value)} ${unidadBase || 'Un'}`
}

function formatMoneda(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function diffDiasDesdeHoy(fechaIso: string): number {
  const fecha = parseFechaIso(fechaIso)
  if (!fecha) return Number.POSITIVE_INFINITY
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  fecha.setHours(0, 0, 0, 0)
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function minFechaIso(a: string | null, b: string | null): string | null {
  const ta = parseFechaIso(a)?.getTime() ?? Number.POSITIVE_INFINITY
  const tb = parseFechaIso(b)?.getTime() ?? Number.POSITIVE_INFINITY
  if (ta === Number.POSITIVE_INFINITY && tb === Number.POSITIVE_INFINITY) return null
  return ta <= tb ? a : b
}

function MoneyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4.75 7.75h14.5v8.5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2v-8.5Z" />
      <path d="M7.5 6V5.5A1.75 1.75 0 0 1 9.25 3.75h5.5A1.75 1.75 0 0 1 16.5 5.5V6" />
      <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
      <path d="M10.29 4.86 3.86 16A2 2 0 0 0 5.59 19h12.82A2 2 0 0 0 20.14 16L13.71 4.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="m12 3.75 7 4.03v8.44l-7 4.03-7-4.03V7.78l7-4.03Z" />
      <path d="m5 8.25 7 4 7-4" />
      <path d="M12 12.25v8" />
    </svg>
  )
}

function KpiCard({
  title,
  value,
  help,
  accent = false,
  icon,
}: {
  title: string
  value: string
  help: string
  accent?: boolean
  icon: React.ReactNode
}) {
  return (
    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
            {title}
          </p>
          <p
            className={`mt-3 text-3xl font-bold tracking-tight ${
              accent ? 'text-[#CD1818]' : 'text-[#171717]'
            }`}
          >
            {value}
          </p>
          <p className="mt-2 text-sm text-[#8997A6]">{help}</p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            accent ? 'bg-red-50 text-[#CD1818]' : 'bg-gray-50 text-[#8997A6]'
          }`}
        >
          {icon}
        </div>
      </div>
    </article>
  )
}

export function DepositoDashboardPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    return subscribeMovimientosInventario(setMovimientos)
  }, [])

  const insumosById = useMemo(() => {
    const map = new Map<string, Insumo>()
    for (const insumo of insumos) map.set(insumo.id, insumo)
    return map
  }, [insumos])

  const resumen = useMemo(() => {
    const movimientosCentral = movimientosEnUbicacion(
      movimientos,
      UBICACION_DEPOSITO_CENTRAL,
    )
    const stockPorInsumo = new Map<string, number>()
    const lotesPorInsumo = new Map<string, Map<string, LoteResumen>>()
    const ultimaSalidaPorInsumo = new Map<string, Date>()
    const ultimaEntradaPorInsumo = new Map<string, Date>()

    for (const movimiento of movimientosCentral) {
      for (const item of movimiento.items) {
        const cantidad = Number(item.cantidad)
        const delta = getDeltaMovimiento(movimiento.tipo, cantidad)
        if (!Number.isFinite(delta) || delta === 0) continue

        stockPorInsumo.set(
          item.insumoId,
          (stockPorInsumo.get(item.insumoId) ?? 0) + delta,
        )

        const loteKey = item.lote?.trim() ?? ''
        const buckets =
          lotesPorInsumo.get(item.insumoId) ?? new Map<string, LoteResumen>()
        const actual = buckets.get(loteKey) ?? {
          insumoId: item.insumoId,
          lote: loteKey || 'Sin lote',
          fechaVencimiento: null,
          stock: 0,
        }

        actual.stock += delta
        const fechaItem =
          typeof item.fechaVencimiento === 'string' && item.fechaVencimiento.trim()
            ? item.fechaVencimiento.trim()
            : null
        actual.fechaVencimiento = minFechaIso(actual.fechaVencimiento, fechaItem)
        buckets.set(loteKey, actual)
        lotesPorInsumo.set(item.insumoId, buckets)

        if (movimiento.tipo === 'EGRESO' && movimiento.fecha) {
          const prev = ultimaSalidaPorInsumo.get(item.insumoId)
          if (!prev || movimiento.fecha.getTime() > prev.getTime()) {
            ultimaSalidaPorInsumo.set(item.insumoId, movimiento.fecha)
          }
        }

        if (movimiento.tipo === 'INGRESO' && movimiento.fecha) {
          const prev = ultimaEntradaPorInsumo.get(item.insumoId)
          if (!prev || movimiento.fecha.getTime() > prev.getTime()) {
            ultimaEntradaPorInsumo.set(item.insumoId, movimiento.fecha)
          }
        }
      }
    }

    const capitalInmovilizado = insumos.reduce((acc, insumo) => {
      const stockActual = Math.max(0, stockPorInsumo.get(insumo.id) ?? 0)
      return acc + stockActual * insumo.costoPorUnidadBase
    }, 0)

    const lotesCriticos: LoteCritico[] = []
    for (const [insumoId, lotes] of lotesPorInsumo) {
      const insumo = insumosById.get(insumoId)
      if (!insumo) continue

      for (const lote of lotes.values()) {
        if (lote.stock <= 0 || !lote.fechaVencimiento) continue
        const diasRestantes = diffDiasDesdeHoy(lote.fechaVencimiento)
        if (diasRestantes > 15) continue

        lotesCriticos.push({
          insumoId,
          insumoLabel: formatLabelInsumo(insumo),
          lote: lote.lote,
          fechaVencimiento: lote.fechaVencimiento,
          stock: lote.stock,
          unidadBase: insumo.unidadBase,
          diasRestantes,
        })
      }
    }

    lotesCriticos.sort((a, b) => {
      if (a.diasRestantes !== b.diasRestantes) return a.diasRestantes - b.diasRestantes
      return a.insumoLabel.localeCompare(b.insumoLabel, 'es', {
        sensitivity: 'base',
      })
    })

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const sinRotacion: FilaSinRotacion[] = insumos
      .map((insumo) => {
        const stockActual = stockPorInsumo.get(insumo.id) ?? 0
        return {
          insumoId: insumo.id,
          insumoLabel: formatLabelInsumo(insumo),
          stockActual,
          unidadBase: insumo.unidadBase,
          ultimaSalida: ultimaSalidaPorInsumo.get(insumo.id) ?? null,
          ultimaEntrada: ultimaEntradaPorInsumo.get(insumo.id) ?? null,
        }
      })
      .filter((fila) => fila.stockActual > 0)
      .filter((fila) => {
        const referencia = fila.ultimaSalida ?? fila.ultimaEntrada
        if (!referencia) return false

        const ultima = new Date(referencia)
        ultima.setHours(0, 0, 0, 0)
        const diff = Math.floor(
          (hoy.getTime() - ultima.getTime()) / (1000 * 60 * 60 * 24),
        )
        return diff > 30
      })
      .sort((a, b) => {
        if (!a.ultimaSalida && !b.ultimaSalida) {
          return a.insumoLabel.localeCompare(b.insumoLabel, 'es', {
            sensitivity: 'base',
          })
        }
        if (!a.ultimaSalida) return -1
        if (!b.ultimaSalida) return 1
        return a.ultimaSalida.getTime() - b.ultimaSalida.getTime()
      })

    return {
      capitalInmovilizado,
      lotesCriticos,
      sinRotacion,
    }
  }, [insumos, insumosById, movimientos])

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Dashboard del depósito
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Vista financiera y operativa del capital inmovilizado, vencimientos FEFO y mercadería sin rotación.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            title="Capital inmovilizado"
            value={formatMoneda(resumen.capitalInmovilizado)}
            help="Valorización total del stock positivo del depósito."
            icon={<MoneyIcon />}
          />
          <KpiCard
            title="Lotes críticos"
            value={resumen.lotesCriticos.length.toLocaleString('es-AR')}
            help="Lotes vencidos, que vencen hoy o dentro de los próximos 15 días."
            accent={resumen.lotesCriticos.length > 0}
            icon={<AlertIcon />}
          />
          <KpiCard
            title="Artículos sin rotación"
            value={resumen.sinRotacion.length.toLocaleString('es-AR')}
            help="Insumos con stock actual cuya última salida fue hace más de 30 días; si nunca salieron, se toma como referencia su último ingreso."
            icon={<BoxIcon />}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#CD1818]">
                Próximos vencimientos
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                Lotes con stock positivo que ya vencieron o vencen dentro de 15 días.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Insumo</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Vencimiento</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resumen.lotesCriticos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-[#8997A6]">
                        No hay lotes críticos para mostrar.
                      </td>
                    </tr>
                  ) : (
                    resumen.lotesCriticos.map((lote) => {
                      const vencido = lote.diasRestantes < 0
                      const classFecha = vencido
                        ? 'text-[#CD1818]'
                        : 'text-orange-600'

                      return (
                        <tr key={`${lote.insumoId}-${lote.lote}-${lote.fechaVencimiento}`}>
                          <td className="px-4 py-3 font-medium text-[#171717]">
                            {lote.insumoLabel}
                          </td>
                          <td className="px-4 py-3 text-[#171717]">{lote.lote}</td>
                          <td className={`px-4 py-3 font-medium ${classFecha}`}>
                            {formatFechaIso(lote.fechaVencimiento)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#171717]">
                            {formatCantidadUnidad(lote.stock, lote.unidadBase)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-[#CD1818]">
                Mercadería inmovilizada (+30 días)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                Insumos con stock positivo que no registran egresos hace más de 30 días.
              </p>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Insumo</th>
                    <th className="px-4 py-3 text-right">Stock actual</th>
                    <th className="px-4 py-3">Última salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resumen.sinRotacion.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-[#8997A6]">
                        No hay mercadería inmovilizada mayor a 30 días.
                      </td>
                    </tr>
                  ) : (
                    resumen.sinRotacion.map((fila) => (
                      <tr key={fila.insumoId}>
                        <td className="px-4 py-3 font-medium text-[#171717]">
                          {fila.insumoLabel}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#171717]">
                          {formatCantidadUnidad(fila.stockActual, fila.unidadBase)}
                        </td>
                        <td className="px-4 py-3 text-[#171717]">
                          {fila.ultimaSalida ? formatFecha(fila.ultimaSalida) : 'Sin salidas'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
