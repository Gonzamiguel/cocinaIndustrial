import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Link } from 'react-router-dom'
import {
  archivarPedidosActivos,
  LUGARES_ENTREGA,
  subscribePedidos,
  type PedidoDelDia,
} from '../../lib/menu'

function formatHora(fecha: Date | null): string {
  if (!fecha) return '—'
  const h = String(fecha.getHours()).padStart(2, '0')
  const m = String(fecha.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatFechaArchivo(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

export function AdminPedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoDelDia[]>([])
  const [loadingTurno, setLoadingTurno] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const registrosPorPagina = 10

  useEffect(() => {
    return subscribePedidos(setPedidos)
  }, [])

  const resumenViandas = useMemo(() => {
    const principales = new Map<string, number>()
    const guarniciones = new Map<string, number>()
    /** Por lugar: nombre de ítem (principal o guarnición) → cantidad a empaquetar */
    const itemsPorLugar: Record<string, Record<string, number>> = {}
    for (const l of LUGARES_ENTREGA) itemsPorLugar[l] = {}
    itemsPorLugar.Otros = {}

    for (const p of pedidos) {
      if (p.platoPrincipal && p.platoPrincipal !== '—') {
        principales.set(
          p.platoPrincipal,
          (principales.get(p.platoPrincipal) ?? 0) + 1,
        )
      }
      if (p.guarnicion && p.guarnicion !== '—') {
        guarniciones.set(p.guarnicion, (guarniciones.get(p.guarnicion) ?? 0) + 1)
      }

      const lugarKey =
        p.lugarEntrega &&
        p.lugarEntrega in itemsPorLugar &&
        p.lugarEntrega !== 'Otros'
          ? p.lugarEntrega
          : 'Otros'

      const bucket = itemsPorLugar[lugarKey]
      if (p.platoPrincipal && p.platoPrincipal !== '—') {
        bucket[p.platoPrincipal] = (bucket[p.platoPrincipal] ?? 0) + 1
      }
      if (p.guarnicion && p.guarnicion !== '—') {
        bucket[p.guarnicion] = (bucket[p.guarnicion] ?? 0) + 1
      }
    }

    const sortedPrincipales = [...principales.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'es'),
    )
    const sortedGuarniciones = [...guarniciones.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'es'),
    )

    const logisticaPorSector: { lugar: string; lineas: [string, number][] }[] =
      []
    for (const lugar of [...LUGARES_ENTREGA, 'Otros']) {
      const raw = itemsPorLugar[lugar]
      const entries = Object.entries(raw).filter(([, n]) => n > 0)
      if (entries.length === 0) continue
      entries.sort((a, b) => a[0].localeCompare(b[0], 'es'))
      logisticaPorSector.push({
        lugar,
        lineas: entries as [string, number][],
      })
    }

    return {
      principales: sortedPrincipales,
      guarniciones: sortedGuarniciones,
      logisticaPorSector,
      totalPedidos: pedidos.length,
    }
  }, [pedidos])

  async function handleFinalizarTurno() {
    if (
      !confirm(
        '¿Finalizar turno? Los pedidos activos pasarán a estado «archivado». El historial se conserva para reportes; esta vista solo muestra pedidos activos.',
      )
    ) {
      return
    }
    if (
      !confirm(
        'Confirmá de nuevo: los pedidos visibles dejarán de mostrarse aquí (quedan guardados).',
      )
    ) {
      return
    }
    setError(null)
    setLoadingTurno(true)
    try {
      await archivarPedidosActivos()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo finalizar el turno',
      )
    } finally {
      setLoadingTurno(false)
    }
  }

  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(pedidos.length / registrosPorPagina)),
    [pedidos.length, registrosPorPagina],
  )

  const paginaSegura = useMemo(
    () => Math.min(Math.max(1, paginaActual), totalPaginas),
    [paginaActual, totalPaginas],
  )

  const pedidosPagina = useMemo(() => {
    const start = (paginaSegura - 1) * registrosPorPagina
    const end = start + registrosPorPagina
    return pedidos.slice(start, end)
  }, [paginaSegura, pedidos, registrosPorPagina])

  function exportarPedidos() {
    if (pedidos.length === 0) return
    const headers = [
      'Hora del Pedido',
      'Nombre y Apellido',
      'Lugar de Entrega',
      'Plato Principal',
      'Guarnición',
    ]
    const rows = pedidos.map((p) => [
      formatHora(p.fecha),
      p.nombreCliente,
      p.lugarEntrega,
      p.platoPrincipal,
      p.guarnicion,
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
    const nombreArchivo = `Planilla_Pedidos_${formatFechaArchivo(new Date())}.xlsx`
    XLSX.writeFile(wb, nombreArchivo)
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Pedidos del día
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Solo pedidos activos · Resumen para cocina · Detalle abajo
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#171717] ring-1 ring-gray-200">
              {pedidos.length} activo{pedidos.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              disabled={loadingTurno || pedidos.length === 0}
              onClick={handleFinalizarTurno}
              className="rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingTurno ? 'Procesando…' : 'Finalizar turno'}
            </button>
          </div>
        </div>
        <div className="mt-3 md:hidden">
          <Link
            to="/"
            className="text-xs font-medium text-[#CD1818] underline-offset-2 hover:text-[#171717] hover:underline"
          >
            Ir a vista cliente
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-sm text-[#CD1818]"
          >
            {error}
          </div>
        ) : null}

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                className="text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]"
              >
                Resumen rápido — viandas
              </h2>
              <p className="mt-1 text-sm text-[#8997A6]">
                Totales según pedidos activos ({resumenViandas.totalPedidos}{' '}
                {resumenViandas.totalPedidos === 1 ? 'pedido' : 'pedidos'})
              </p>
            </div>
            <button
              type="button"
              onClick={exportarPedidos}
              disabled={pedidos.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white disabled:shadow-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Exportar a Excel
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#CD1818]">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#CD1818] ring-1 ring-gray-200"
                  aria-hidden
                >
                  P
                </span>
                Platos principales
              </div>
              <div className="max-h-56 overflow-y-auto bg-white p-3">
                {resumenViandas.principales.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[#8997A6]">
                    Sin datos
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {resumenViandas.principales.map(([nombre, cantidad]) => (
                      <li
                        key={nombre}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate font-medium text-[#171717]">
                          {nombre}
                        </span>
                        <span className="shrink-0 rounded-lg bg-gray-50 px-2.5 py-1 text-base font-bold tabular-nums text-[#171717] ring-1 ring-gray-200">
                          ×{cantidad}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#CD1818]">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#CD1818] ring-1 ring-gray-200"
                  aria-hidden
                >
                  G
                </span>
                Guarniciones
              </div>
              <div className="max-h-56 overflow-y-auto bg-white p-3">
                {resumenViandas.guarniciones.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[#8997A6]">
                    Sin datos
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {resumenViandas.guarniciones.map(([nombre, cantidad]) => (
                      <li
                        key={nombre}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate font-medium text-[#171717]">
                          {nombre}
                        </span>
                        <span className="shrink-0 rounded-lg bg-gray-50 px-2.5 py-1 text-base font-bold tabular-nums text-[#171717] ring-1 ring-gray-200">
                          ×{cantidad}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#CD1818]">
              <span className="rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#CD1818] ring-1 ring-gray-200">
                Logística
              </span>
              Armado por sector de entrega
            </div>
            <div className="bg-white p-4 sm:p-5">
              {resumenViandas.logisticaPorSector.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#8997A6]">
                  Sin pedidos activos para armar por sector.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {resumenViandas.logisticaPorSector.map(({ lugar, lineas }) => (
                    <div
                      key={lugar}
                      className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-base font-bold text-[#CD1818]">
                        {lugar}
                      </div>
                      <ul className="flex flex-col gap-2 p-4">
                        {lineas.map(([nombre, cantidad]) => (
                          <li
                            key={`${lugar}-${nombre}`}
                            className="flex flex-wrap items-baseline gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                          >
                            <span className="text-lg font-bold tabular-nums leading-none text-[#171717]">
                              {cantidad}×
                            </span>
                            <span className="font-medium text-[#171717]">
                              {nombre}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {pedidos.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-[#8997A6]">
              No hay pedidos activos. Los archivados siguen en Firestore para el
              futuro dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                    <th className="whitespace-nowrap px-5 py-4">Hora</th>
                    <th className="whitespace-nowrap px-5 py-4">Consumo</th>
                    <th className="px-5 py-4">Cliente</th>
                    <th className="whitespace-nowrap px-5 py-4">Ubicación</th>
                    <th className="min-w-[220px] px-5 py-4">Pedido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pedidosPagina.map((p) => (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-sm font-medium text-[#8997A6]">
                        {formatHora(p.fecha)}
                      </td>
                      <td className="max-w-[10rem] whitespace-normal px-5 py-4 text-sm text-[#8997A6]">
                        {p.fechaConsumo ?? '—'}
                      </td>
                      <td className="px-5 py-4 font-medium text-[#171717]">
                        {p.nombreCliente}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-[#171717] ring-1 ring-gray-200">
                          {p.lugarEntrega}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#171717]">
                        <span className="font-medium text-[#171717]">
                          {p.platoPrincipal}
                        </span>
                        <span className="mx-1.5 text-[#8997A6]">+</span>
                        <span className="text-[#171717]">{p.guarnicion}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-[#171717]">
                <span className="font-medium">
                  Página {paginaSegura} de {totalPaginas}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    disabled={paginaSegura === 1}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] focus:outline-none focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-[#8997A6]"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaginaActual((p) => Math.min(totalPaginas, p + 1))
                    }
                    disabled={paginaSegura === totalPaginas}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] focus:outline-none focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-[#8997A6]"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
