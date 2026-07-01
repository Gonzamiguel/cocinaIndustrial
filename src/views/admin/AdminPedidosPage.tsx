import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  archivarPedidosActivos,
  subscribeMenu,
  subscribePedidos,
  type MenuItem,
  type PedidoDelDia,
} from '../../lib/menu'
import {
  empresaLabelPedido,
  FILTRO_DIA_TODOS,
  FILTRO_EMPRESA_TODAS,
  filtrarPedidosAdmin,
  filtrarPedidosPorDia,
  opcionesFiltroDia,
  opcionesFiltroEmpresa,
  resumenCantidadesPlatos,
  resumenPorEmpresa,
} from '../../lib/adminPedidosUi'
import {
  resumenMenuItemsParaDespacho,
  type DespachoDesdePedidosState,
} from '../../lib/pedidosDespacho'

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

function ListaCantidades({
  titulo,
  icono,
  items,
}: {
  titulo: string
  icono: string
  items: [string, number][]
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#CD1818]">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#CD1818] ring-1 ring-gray-200"
          aria-hidden
        >
          {icono}
        </span>
        {titulo}
      </div>
      <div className="max-h-56 overflow-y-auto bg-white p-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#8997A6]">Sin datos</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map(([nombre, cantidad]) => (
              <li
                key={nombre}
                className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate font-medium text-[#171717]">{nombre}</span>
                <span className="shrink-0 rounded-lg bg-gray-50 px-2.5 py-1 text-base font-bold tabular-nums text-[#171717] ring-1 ring-gray-200">
                  ×{cantidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function AdminPedidosPage() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState<PedidoDelDia[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [filtroDia, setFiltroDia] = useState(FILTRO_DIA_TODOS)
  const [filtroEmpresa, setFiltroEmpresa] = useState(FILTRO_EMPRESA_TODAS)
  const [loadingTurno, setLoadingTurno] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const registrosPorPagina = 15

  useEffect(() => {
    return subscribePedidos(setPedidos)
  }, [])

  useEffect(() => subscribeMenu(setMenuItems), [])

  const opcionesDia = useMemo(() => opcionesFiltroDia(pedidos), [pedidos])
  const opcionesEmpresa = useMemo(() => opcionesFiltroEmpresa(pedidos), [pedidos])

  const pedidosFiltrados = useMemo(
    () => filtrarPedidosAdmin(pedidos, filtroDia, filtroEmpresa),
    [pedidos, filtroDia, filtroEmpresa],
  )

  const resumenViandas = useMemo(() => {
    const { principales, guarniciones } = resumenCantidadesPlatos(pedidosFiltrados)
    const pedidosMismoDia = filtrarPedidosPorDia(pedidos, filtroDia)
    return {
      principales,
      guarniciones,
      totalPedidos: pedidosFiltrados.length,
      porEmpresa: resumenPorEmpresa(pedidosMismoDia),
    }
  }, [pedidosFiltrados, pedidos, filtroDia])

  useEffect(() => {
    setPaginaActual(1)
  }, [filtroDia, filtroEmpresa])

  useEffect(() => {
    if (filtroDia !== FILTRO_DIA_TODOS && !opcionesDia.some((o) => o.clave === filtroDia)) {
      setFiltroDia(FILTRO_DIA_TODOS)
    }
  }, [filtroDia, opcionesDia])

  useEffect(() => {
    if (
      filtroEmpresa !== FILTRO_EMPRESA_TODAS &&
      !opcionesEmpresa.some((o) => o.clave === filtroEmpresa)
    ) {
      setFiltroEmpresa(FILTRO_EMPRESA_TODAS)
    }
  }, [filtroEmpresa, opcionesEmpresa])

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
      setError(e instanceof Error ? e.message : 'No se pudo finalizar el turno')
    } finally {
      setLoadingTurno(false)
    }
  }

  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(pedidosFiltrados.length / registrosPorPagina)),
    [pedidosFiltrados.length, registrosPorPagina],
  )

  const paginaSegura = useMemo(
    () => Math.min(Math.max(1, paginaActual), totalPaginas),
    [paginaActual, totalPaginas],
  )

  const pedidosPagina = useMemo(() => {
    const start = (paginaSegura - 1) * registrosPorPagina
    return pedidosFiltrados.slice(start, start + registrosPorPagina)
  }, [paginaSegura, pedidosFiltrados, registrosPorPagina])

  const etiquetaFiltroActivo = useMemo(() => {
    const partes: string[] = []
    if (filtroDia === FILTRO_DIA_TODOS) {
      partes.push('Todos los días')
    } else {
      partes.push(opcionesDia.find((o) => o.clave === filtroDia)?.label ?? 'Día')
    }
    if (filtroEmpresa === FILTRO_EMPRESA_TODAS) {
      partes.push('todas las empresas')
    } else {
      partes.push(opcionesEmpresa.find((o) => o.clave === filtroEmpresa)?.label ?? 'empresa')
    }
    return partes.join(' · ')
  }, [filtroDia, filtroEmpresa, opcionesDia, opcionesEmpresa])

  const puedeGenerarRemito = useMemo(
    () =>
      filtroDia !== FILTRO_DIA_TODOS &&
      filtroEmpresa !== FILTRO_EMPRESA_TODAS &&
      pedidosFiltrados.length > 0,
    [filtroDia, filtroEmpresa, pedidosFiltrados.length],
  )

  function generarRemitoDesdeFiltro() {
    const items = resumenMenuItemsParaDespacho(pedidosFiltrados, menuItems)
    if (items.length === 0) {
      setError(
        'No se pudieron reconocer los platos del menú. Los pedidos nuevos incluyen IDs; los viejos pueden requerir nombres exactos.',
      )
      return
    }
    setError(null)
    const empresa =
      opcionesEmpresa.find((o) => o.clave === filtroEmpresa)?.label ?? ''
    navigate('/admin/despacho', {
      state: {
        empresa,
        fechaConsumo: filtroDia,
        pedidoIds: pedidosFiltrados.map((p) => p.id),
        items,
      } satisfies DespachoDesdePedidosState,
    })
  }

  function exportarPedidos() {
    const fuente = pedidosFiltrados
    if (fuente.length === 0) return
    const headers = [
      'Hora del pedido',
      'Día de consumo',
      'Empresa',
      'Nombre y apellido',
      'Plato principal',
      'Guarnición',
    ]
    const rows = fuente.map((p) => [
      formatHora(p.fecha),
      p.fechaConsumo ?? '—',
      empresaLabelPedido(p),
      p.nombreCliente,
      p.platoPrincipal,
      p.guarnicion,
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
    const sufijo =
      filtroEmpresa === FILTRO_EMPRESA_TODAS
        ? 'Todos'
        : etiquetaFiltroActivo.replace(/\s+/g, '_')
    const nombreArchivo = `Pedidos_${sufijo}_${formatFechaArchivo(new Date())}.xlsx`
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
              Pedidos activos (semana o quincena) · filtrá por día y empresa para armar viandas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#171717] ring-1 ring-gray-200">
              {pedidos.length} activo{pedidos.length === 1 ? '' : 's'} total
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

        {pedidos.length > 0 ? (
          <>
            <section className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]">
                Día de consumo
              </h2>
              <p className="mt-1 text-xs text-[#8997A6]">
                Cada empleado genera una fila por día que pidió (ej. lun–vie = 5 filas).
              </p>
              <div
                role="tablist"
                aria-label="Días de consumo con pedidos activos"
                className="mt-3 flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filtroDia === FILTRO_DIA_TODOS}
                  onClick={() => setFiltroDia(FILTRO_DIA_TODOS)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    filtroDia === FILTRO_DIA_TODOS
                      ? 'bg-[#CD1818] text-white shadow-sm'
                      : 'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Todos
                  <span className="ml-1.5 text-xs font-medium opacity-80">({pedidos.length})</span>
                </button>
                {opcionesDia.map((op) => (
                  <button
                    key={op.clave}
                    type="button"
                    role="tab"
                    aria-selected={filtroDia === op.clave}
                    onClick={() => setFiltroDia(op.clave)}
                    title={op.label}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      filtroDia === op.clave
                        ? 'bg-[#CD1818] text-white shadow-sm'
                        : 'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {op.labelCorto}
                    <span className="ml-1.5 text-xs font-medium opacity-80">({op.cantidad})</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]">
                Empresa
              </h2>
              <div
                role="tablist"
                aria-label="Empresas con pedidos activos"
                className="mt-3 flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filtroEmpresa === FILTRO_EMPRESA_TODAS}
                  onClick={() => setFiltroEmpresa(FILTRO_EMPRESA_TODAS)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    filtroEmpresa === FILTRO_EMPRESA_TODAS
                      ? 'bg-[#CD1818] text-white shadow-sm'
                      : 'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Todas
                  <span className="ml-1.5 text-xs font-medium opacity-80">({pedidos.length})</span>
                </button>
                {opcionesEmpresa.map((op) => (
                  <button
                    key={op.clave}
                    type="button"
                    role="tab"
                    aria-selected={filtroEmpresa === op.clave}
                    onClick={() => setFiltroEmpresa(op.clave)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      filtroEmpresa === op.clave
                        ? 'bg-[#CD1818] text-white shadow-sm'
                        : 'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {op.label}
                    <span className="ml-1.5 text-xs font-medium opacity-80">({op.cantidad})</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <p className="mb-6 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-[#8997A6]">
            Sin pedidos activos todavía. Cuando una empresa cargue pedidos por el link, acá
            aparecerán los filtros por día y por empresa.
          </p>
        )}

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]">
                Resumen de viandas
              </h2>
              <p className="mt-1 text-sm text-[#8997A6]">
                {etiquetaFiltroActivo} · {resumenViandas.totalPedidos}{' '}
                {resumenViandas.totalPedidos === 1 ? 'pedido' : 'pedidos'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {puedeGenerarRemito ? (
                <button
                  type="button"
                  onClick={generarRemitoDesdeFiltro}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#CD1818]/30 bg-white px-4 py-2.5 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-[#CD1818]/5"
                >
                  Generar remito
                </button>
              ) : null}
              <button
                type="button"
                onClick={exportarPedidos}
                disabled={pedidosFiltrados.length === 0}
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
              Exportar Excel
            </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ListaCantidades
              titulo="Platos principales"
              icono="P"
              items={resumenViandas.principales}
            />
            <ListaCantidades
              titulo="Guarniciones"
              icono="G"
              items={resumenViandas.guarniciones}
            />
          </div>

          {filtroEmpresa === FILTRO_EMPRESA_TODAS && resumenViandas.porEmpresa.length > 1 ? (
            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#CD1818]">
                Vista rápida por empresa
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {resumenViandas.porEmpresa.map((g) => (
                  <button
                    key={g.clave}
                    type="button"
                    onClick={() => setFiltroEmpresa(g.clave)}
                    className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-left transition hover:border-[#CD1818]/30 hover:bg-white"
                  >
                    <p className="font-semibold text-[#171717]">{g.label}</p>
                    <p className="mt-1 text-xs text-[#8997A6]">
                      {g.pedidos} pedido{g.pedidos === 1 ? '' : 's'} · {g.principales} P ·{' '}
                      {g.guarniciones} G
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]">
              Registro de pedidos
            </h2>
            <span className="text-xs text-[#8997A6]">
              Quién pidió y qué · {pedidosFiltrados.length} fila
              {pedidosFiltrados.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {pedidosFiltrados.length === 0 ? (
              <p className="px-6 py-16 text-center text-sm text-[#8997A6]">
                {pedidos.length === 0
                  ? 'No hay pedidos activos. Los archivados siguen en Firestore para reportes.'
                  : 'No hay pedidos con el filtro de día y empresa actual.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                      <th className="whitespace-nowrap px-5 py-4">Hora</th>
                      <th className="whitespace-nowrap px-5 py-4">Consumo</th>
                      <th className="whitespace-nowrap px-5 py-4">Empresa</th>
                      <th className="px-5 py-4">Persona</th>
                      <th className="min-w-[220px] px-5 py-4">Pedido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pedidosPagina.map((p) => (
                      <tr key={p.id} className="transition-colors hover:bg-gray-50">
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-sm font-medium text-[#8997A6]">
                          {formatHora(p.fecha)}
                        </td>
                        <td className="max-w-[10rem] whitespace-normal px-5 py-4 text-sm text-[#8997A6]">
                          {p.fechaConsumo ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <span className="inline-flex max-w-[10rem] truncate rounded-full bg-[#CD1818]/8 px-3 py-1 text-xs font-semibold text-[#CD1818] ring-1 ring-[#CD1818]/15">
                            {empresaLabelPedido(p)}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium text-[#171717]">
                          {p.nombreCliente}
                        </td>
                        <td className="px-5 py-4 text-[#171717]">
                          <span className="font-medium">{p.platoPrincipal}</span>
                          {p.guarnicion && p.guarnicion !== '—' ? (
                            <>
                              <span className="mx-1.5 text-[#8997A6]">+</span>
                              <span>{p.guarnicion}</span>
                            </>
                          ) : null}
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
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                      disabled={paginaSegura === totalPaginas}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-[#171717] transition hover:border-[#CD1818]/30 hover:text-[#CD1818] disabled:cursor-not-allowed disabled:text-[#8997A6]"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
