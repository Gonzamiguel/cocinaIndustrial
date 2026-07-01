import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { ModalDespachoRemitoDetalle } from '../../components/cocina/ModalDespachoRemitoDetalle'
import { useToast } from '../../context/ToastContext'
import { exportarRemitoDespachoPdf } from '../../lib/despachoRemitoPdf'
import {
  loteKeyMenu,
  ordenarLotesFifo,
  registrarDespachoViandas,
  subscribeDespachosViandas,
  sugerirAsignacionFifo,
  type DespachoViandaItem,
  type DespachoViandaRegistro,
} from '../../lib/despachosViandas'
import { empresaLabelPedido } from '../../lib/adminPedidosUi'
import {
  construirRemitoDesdePedidos,
  fechaConsumoAInputDate,
  nuevaKeyFilaDespacho,
  opcionesDiaConsumoEmpresa,
  pedidosActivosEmpresaDia,
  type DespachoDesdePedidosState,
} from '../../lib/pedidosDespacho'
import {
  subscribeMenu,
  subscribePedidos,
  type MenuItem,
  type MenuStockLote,
  type PedidoDelDia,
} from '../../lib/menu'
import {
  esAlertaVencimiento,
  formatFechaVencimiento,
  obtenerEstadoVencimiento,
} from '../../lib/vencimientoLote'
import { selectClassComanda, inputClassComanda } from '../campamento/comandasFormShared'

type FilaDespacho = {
  key: string
  menuItemId: string
  cantidadStr: string
  lotesQty: Record<string, string>
}

function parseMenuLoteFromKey(key: string, lotes: MenuStockLote[]): MenuStockLote | null {
  return lotes.find((l) => loteKeyMenu(l) === key) ?? null
}

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nuevaFila(): FilaDespacho {
  return {
    key: nuevaKeyFilaDespacho(),
    menuItemId: '',
    cantidadStr: '',
    lotesQty: {},
  }
}

function filasDesdeLineasPedidos(
  lineas: { menuItemId: string; cantidadTotal: number; lotesQty: Record<string, string> }[],
): FilaDespacho[] {
  return lineas.map((l) => ({
    key: nuevaKeyFilaDespacho(l.menuItemId),
    menuItemId: l.menuItemId,
    cantidadStr: String(l.cantidadTotal),
    lotesQty: l.lotesQty,
  }))
}

export function AdminDespachoPage() {
  const { showToast } = useToast()
  const location = useLocation()
  const prefillAplicado = useRef(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [pedidos, setPedidos] = useState<PedidoDelDia[]>([])
  const [historial, setHistorial] = useState<DespachoViandaRegistro[]>([])
  const [empresa, setEmpresa] = useState('')
  const [diaPedidosSeleccionado, setDiaPedidosSeleccionado] = useState('')
  const [fechaConsumoPedidos, setFechaConsumoPedidos] = useState('')
  const [pedidoIdsVinculados, setPedidoIdsVinculados] = useState<string[]>([])
  const [lugarEntrega, setLugarEntrega] = useState('')
  const [fechaDespacho, setFechaDespacho] = useState(toInputDate(new Date()))
  const [observaciones, setObservaciones] = useState('')
  const [filas, setFilas] = useState<FilaDespacho[]>([nuevaFila()])
  const [marcarPedidosDespachados, setMarcarPedidosDespachados] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [remitoDetalle, setRemitoDetalle] = useState<DespachoViandaRegistro | null>(null)
  const [vistaFormulario, setVistaFormulario] = useState(false)

  useEffect(() => subscribeMenu(setMenuItems), [])
  useEffect(() => subscribePedidos(setPedidos), [])
  useEffect(() => subscribeDespachosViandas(setHistorial, 100), [])

  const menuPorId = useMemo(() => {
    const m = new Map<string, MenuItem>()
    for (const it of menuItems) m.set(it.id, it)
    return m
  }, [menuItems])

  const empresasPedidos = useMemo(() => {
    const set = new Set<string>()
    for (const p of pedidos) {
      const label = empresaLabelPedido(p)
      if (label !== 'Sin empresa') set.add(label)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [pedidos])

  const pedidosEmpresa = useMemo(() => {
    const emp = empresa.trim().toLowerCase()
    if (!emp) return []
    return pedidos.filter((p) => {
      if (empresaLabelPedido(p).toLowerCase() !== emp) return false
      if (fechaConsumoPedidos && p.fechaConsumo !== fechaConsumoPedidos) return false
      return true
    })
  }, [pedidos, empresa, fechaConsumoPedidos])

  const pedidoIdsParaRemito = useMemo(() => {
    if (pedidoIdsVinculados.length > 0) return pedidoIdsVinculados
    return pedidosEmpresa.map((p) => p.id)
  }, [pedidoIdsVinculados, pedidosEmpresa])

  const opcionesDiaEmpresa = useMemo(
    () => opcionesDiaConsumoEmpresa(pedidos, empresa),
    [pedidos, empresa],
  )

  function aplicarRemitoDesdePedidos(
    empresaNombre: string,
    fechaConsumo: string,
    pedidosFuente: PedidoDelDia[],
  ): boolean {
    const { items, pedidoIds, lineas } = construirRemitoDesdePedidos(
      pedidosFuente,
      menuItems,
    )
    if (items.length === 0) return false

    setEmpresa(empresaNombre)
    setDiaPedidosSeleccionado(fechaConsumo)
    setFechaConsumoPedidos(fechaConsumo)
    setPedidoIdsVinculados(pedidoIds)
    setLugarEntrega((prev) => prev.trim() || empresaNombre)
    setMarcarPedidosDespachados(true)

    const fechaInput = fechaConsumoAInputDate(fechaConsumo)
    if (fechaInput) setFechaDespacho(fechaInput)

    setFilas(filasDesdeLineasPedidos(lineas))
    return true
  }

  function cargarDesdePedidos() {
    if (!empresa.trim() || !diaPedidosSeleccionado) {
      showToast('Elegí empresa y día de consumo.', 'error')
      return
    }
    const lista = pedidosActivosEmpresaDia(pedidos, empresa, diaPedidosSeleccionado)
    if (lista.length === 0) {
      showToast('No hay pedidos activos para esa empresa y día.', 'error')
      return
    }
    const ok = aplicarRemitoDesdePedidos(empresa.trim(), diaPedidosSeleccionado, lista)
    if (!ok) {
      showToast('No se reconocieron platos de menú en esos pedidos.', 'error')
      return
    }
    showToast(
      `${lista.length} pedido(s) cargados con lotes FIFO sugeridos. Revisá y confirmá el remito.`,
      'success',
    )
  }

  function handleEmpresaChange(valor: string) {
    setEmpresa(valor)
    setDiaPedidosSeleccionado('')
    setFechaConsumoPedidos('')
    setPedidoIdsVinculados([])
  }

  useEffect(() => {
    if (prefillAplicado.current) return
    const prefill = location.state as DespachoDesdePedidosState | null
    if (!prefill?.empresa || prefill.items.length === 0) return
    if (menuItems.length === 0) return

    const pedidosPrefill = pedidos.filter((p) => prefill.pedidoIds.includes(p.id))
    const fuente =
      pedidosPrefill.length > 0
        ? pedidosPrefill
        : pedidosActivosEmpresaDia(pedidos, prefill.empresa, prefill.fechaConsumo)

    prefillAplicado.current = true
    setVistaFormulario(true)

    if (aplicarRemitoDesdePedidos(prefill.empresa, prefill.fechaConsumo, fuente)) {
      showToast(
        `Remito precargado: ${prefill.items.length} vianda(s) con lotes FIFO sugeridos. Revisá y confirmá.`,
        'success',
      )
    } else {
      setEmpresa(prefill.empresa)
      setDiaPedidosSeleccionado(prefill.fechaConsumo)
      setFechaConsumoPedidos(prefill.fechaConsumo)
      setPedidoIdsVinculados(prefill.pedidoIds)
      setLugarEntrega(prefill.empresa)
      setFilas(filasDesdeLineasPedidos(
        prefill.items.map((item) => ({
          menuItemId: item.menuItemId,
          cantidadTotal: item.cantidadTotal,
          lotesQty: sugerirAsignacionFifo(
            menuPorId.get(item.menuItemId)?.stockLotes ?? [],
            item.cantidadTotal,
          ),
        })),
      ))
      showToast('Remito precargado desde pedidos del día.', 'success')
    }
    window.history.replaceState({}, document.title)
  }, [location.state, menuItems, menuPorId, pedidos, showToast])

  const alertasStock = useMemo(() => {
    let vencidos = 0
    let criticos = 0
    let proximos = 0
    for (const m of menuItems) {
      for (const l of m.stockLotes ?? []) {
        if (l.cantidad <= 0) continue
        const { nivel } = obtenerEstadoVencimiento(l.fechaVencimiento)
        if (nivel === 'vencido') vencidos += l.cantidad
        else if (nivel === 'critico') criticos += l.cantidad
        else if (nivel === 'proximo') proximos += l.cantidad
      }
    }
    return { vencidos, criticos, proximos }
  }, [menuItems])

  function actualizarFila(key: string, patch: Partial<FilaDespacho>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  }

  function aplicarFifoFila(key: string) {
    const f = filas.find((x) => x.key === key)
    if (!f?.menuItemId) return
    const menu = menuPorId.get(f.menuItemId)
    if (!menu) return
    const cantidad = Math.max(0, Math.floor(Number(f.cantidadStr.replace(',', '.')) || 0))
    if (cantidad <= 0) {
      showToast('Indicá la cantidad total antes de sugerir FIFO.', 'error')
      return
    }
    const lotesQty = sugerirAsignacionFifo(menu.stockLotes ?? [], cantidad)
    const suma = Object.values(lotesQty).reduce((a, v) => a + Number(v), 0)
    if (suma < cantidad) {
      showToast(
        `Stock insuficiente para FIFO: faltan ${cantidad - suma} vianda(s) de «${menu.nombre}».`,
        'error',
      )
    }
    actualizarFila(key, { lotesQty })
    if (suma >= cantidad) {
      showToast('Lotes asignados por vencimiento más próximo (FIFO).', 'success')
    }
  }

  function hayLotesVencidosEnFormulario(): boolean {
    for (const f of filas) {
      const menu = f.menuItemId ? menuPorId.get(f.menuItemId) : undefined
      if (!menu) continue
      for (const [lk, qtyStr] of Object.entries(f.lotesQty)) {
        const qty = Math.floor(Number(qtyStr) || 0)
        if (qty <= 0) continue
        const row = parseMenuLoteFromKey(lk, menu.stockLotes ?? [])
        if (!row) continue
        if (obtenerEstadoVencimiento(row.fechaVencimiento).nivel === 'vencido') return true
      }
    }
    return false
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!empresa.trim()) {
      showToast('Indicá la empresa.', 'error')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDespacho.trim())) {
      showToast('Fecha de despacho inválida.', 'error')
      return
    }

    if (hayLotesVencidosEnFormulario()) {
      const ok = window.confirm(
        'Hay lotes VENCIDOS en este remito. ¿Confirmás el despacho igual?',
      )
      if (!ok) return
    }

    const items: DespachoViandaItem[] = []

    for (const f of filas) {
      const menu = menuPorId.get(f.menuItemId)
      if (!menu) continue
      const cantidadTotal = Math.max(0, Math.floor(Number(f.cantidadStr.replace(',', '.'))))
      if (cantidadTotal <= 0) continue

      const lotesDisp = menu.stockLotes ?? []
      const lotes: DespachoViandaItem['lotes'] = []
      let suma = 0

      for (const [lk, qtyStr] of Object.entries(f.lotesQty)) {
        const qty = Math.max(0, Math.floor(Number(String(qtyStr).replace(',', '.'))))
        if (qty <= 0) continue
        const row = parseMenuLoteFromKey(lk, lotesDisp)
        if (!row) continue
        suma += qty
        lotes.push({
          lote: row.lote,
          fechaVencimiento: row.fechaVencimiento,
          cantidad: qty,
          produccionId: row.produccionId,
          codigoTrazabilidad: row.codigoTrazabilidad,
        })
      }

      if (suma !== cantidadTotal) {
        showToast(
          `Asigná lotes que sumen ${cantidadTotal} para «${menu.nombre}» (ahora suman ${suma}).`,
          'error',
        )
        return
      }

      items.push({
        menuItemId: menu.id,
        nombrePlato: menu.nombre,
        cantidadTotal,
        lotes,
      })
    }

    if (items.length === 0) {
      showToast('Agregá al menos una vianda con cantidad y lotes.', 'error')
      return
    }

    const [y, m, d] = fechaDespacho.split('-').map(Number)
    const fecha = new Date(y, m - 1, d, 12, 0, 0, 0)

    const idsPedidos = marcarPedidosDespachados ? pedidoIdsParaRemito : []

    setIsSubmitting(true)
    try {
      const res = await registrarDespachoViandas({
        fecha,
        empresa: empresa.trim(),
        lugarEntrega: lugarEntrega.trim(),
        pedidoIds: idsPedidos,
        fechaConsumoPedidos: fechaConsumoPedidos.trim() || undefined,
        marcarPedidosDespachados,
        items,
        observaciones: observaciones.trim(),
      })
      showToast(
        marcarPedidosDespachados && idsPedidos.length > 0
          ? `Remito ${res.numeroRemito} registrado. ${idsPedidos.length} pedido(s) marcados como despachados.`
          : `Remito ${res.numeroRemito} registrado.`,
        'success',
      )
      setFilas([nuevaFila()])
      setObservaciones('')
      setPedidoIdsVinculados([])
      setFechaConsumoPedidos('')
      setDiaPedidosSeleccionado('')
      setVistaFormulario(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo registrar el despacho.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  function descargarPdf(remito: DespachoViandaRegistro) {
    exportarRemitoDespachoPdf(remito)
    showToast('PDF generado.', 'success')
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <ModalDespachoRemitoDetalle
        remito={remitoDetalle}
        onClose={() => setRemitoDetalle(null)}
        onDescargarPdf={descargarPdf}
      />

      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818] sm:text-2xl">
          Despacho / remito de salida
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Elegí empresa y día de consumo para cargar pedidos, revisá lotes FIFO y registrá el remito.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {alertasStock.vencidos > 0 || alertasStock.criticos > 0 || alertasStock.proximos > 0 ? (
          <div className="flex flex-wrap gap-2">
            {alertasStock.vencidos > 0 ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200">
                {alertasStock.vencidos} vianda(s) en lotes vencidos
              </span>
            ) : null}
            {alertasStock.criticos > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                {alertasStock.criticos} vianda(s) vencen en ≤2 días
              </span>
            ) : null}
            {alertasStock.proximos > 0 ? (
              <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-900 ring-1 ring-yellow-200">
                {alertasStock.proximos} vianda(s) vencen en ≤7 días — priorizar FIFO
              </span>
            ) : null}
          </div>
        ) : null}

        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                Historial de remitos
              </p>
              <p className="mt-0.5 text-xs text-[#8997A6]">
                {historial.length} remito{historial.length === 1 ? '' : 's'} registrado
                {historial.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVistaFormulario((v) => !v)}
              className="rounded-lg bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:brightness-105"
            >
              {vistaFormulario ? 'Ocultar formulario' : '+ Nuevo remito'}
            </button>
          </div>

          {historial.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#8997A6]">
              Todavía no hay remitos. Creá el primero con «Nuevo remito».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Remito</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Viandas</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.map((d) => {
                    const total = d.items.reduce((acc, it) => acc + it.cantidadTotal, 0)
                    return (
                      <tr key={d.id} className="hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#171717]">
                          {d.numeroRemito}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{d.empresa}</span>
                          {d.lugarEntrega ? (
                            <span className="block text-xs text-[#8997A6]">{d.lugarEntrega}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-[#8997A6]">
                          {formatFechaHora(d.fecha)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {total}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setRemitoDetalle(d)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#171717] hover:border-[#CD1818]/30 hover:text-[#CD1818]"
                            >
                              Ver detalle
                            </button>
                            <button
                              type="button"
                              onClick={() => descargarPdf(d)}
                              className="rounded-lg border border-[#CD1818]/30 bg-[#CD1818]/5 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/10"
                            >
                              Descargar PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {vistaFormulario ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm font-medium text-[#171717]">
                  Empresa *
                  <input
                    list="empresas-pedidos"
                    value={empresa}
                    onChange={(e) => handleEmpresaChange(e.target.value)}
                    className={inputClassComanda}
                    placeholder="Nombre de la empresa"
                  />
                  <datalist id="empresas-pedidos">
                    {empresasPedidos.map((e) => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                </label>
                <label className="block text-sm font-medium text-[#171717]">
                  Lugar de entrega
                  <input
                    value={lugarEntrega}
                    onChange={(e) => setLugarEntrega(e.target.value)}
                    className={inputClassComanda}
                    placeholder="Ej. Oficinas, Predio…"
                  />
                </label>
                <label className="block text-sm font-medium text-[#171717]">
                  Fecha despacho *
                  <input
                    type="date"
                    value={fechaDespacho}
                    onChange={(e) => setFechaDespacho(e.target.value)}
                    className={inputClassComanda}
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                  Cargar desde pedidos
                </p>
                <p className="mt-1 text-xs text-[#8997A6]">
                  Trae cantidades por plato y sugiere lotes por vencimiento (FIFO).
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <label className="block min-w-[12rem] flex-1 text-sm font-medium text-[#171717]">
                    Día de consumo
                    <select
                      value={diaPedidosSeleccionado}
                      onChange={(e) => setDiaPedidosSeleccionado(e.target.value)}
                      disabled={!empresa.trim() || opcionesDiaEmpresa.length === 0}
                      className={selectClassComanda}
                    >
                      <option value="">
                        {!empresa.trim()
                          ? 'Primero elegí empresa'
                          : opcionesDiaEmpresa.length === 0
                            ? 'Sin pedidos activos'
                            : '— Elegir día —'}
                      </option>
                      {opcionesDiaEmpresa.map((op) => (
                        <option key={op.fechaConsumo} value={op.fechaConsumo}>
                          {op.labelCorto} ({op.cantidad} pedido
                          {op.cantidad === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={cargarDesdePedidos}
                    disabled={!empresa.trim() || !diaPedidosSeleccionado}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cargar pedidos
                  </button>
                </div>
              </div>

              {pedidosEmpresa.length > 0 || pedidoIdsParaRemito.length > 0 ? (
                <p className="mt-4 text-xs text-[#8997A6]">
                  {pedidoIdsParaRemito.length} pedido(s) vinculado
                  {pedidoIdsParaRemito.length === 1 ? '' : 's'}
                  {fechaConsumoPedidos ? ` · consumo ${fechaConsumoPedidos}` : ''}
                </p>
              ) : null}
              {pedidoIdsParaRemito.length > 0 ? (
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#171717]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#CD1818]"
                    checked={marcarPedidosDespachados}
                    onChange={(e) => setMarcarPedidosDespachados(e.target.checked)}
                  />
                  Marcar pedidos vinculados como despachados al registrar (
                  {pedidoIdsParaRemito.length})
                </label>
              ) : null}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                  Detalle del remito — viandas y lotes
                </p>
                <p className="mt-0.5 text-xs text-[#8997A6]">
                  Los lotes se ordenan por vencimiento (FIFO). Usá «Sugerir FIFO» para completar
                  automáticamente.
                </p>
              </div>
              <div className="space-y-4 p-4">
                {filas.map((f) => {
                  const menu = f.menuItemId ? menuPorId.get(f.menuItemId) : undefined
                  const lotes = ordenarLotesFifo(menu?.stockLotes ?? [])
                  const cantidad = Math.max(
                    0,
                    Math.floor(Number(f.cantidadStr.replace(',', '.')) || 0),
                  )
                  const asignado = Object.values(f.lotesQty).reduce(
                    (acc, v) => acc + Math.max(0, Math.floor(Number(v) || 0)),
                    0,
                  )
                  return (
                    <div
                      key={f.key}
                      className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block text-sm font-medium text-[#171717] sm:col-span-2">
                          Vianda
                          <select
                            value={f.menuItemId}
                            onChange={(e) =>
                              actualizarFila(f.key, {
                                menuItemId: e.target.value,
                                lotesQty: {},
                              })
                            }
                            className={selectClassComanda}
                          >
                            <option value="">— Elegir plato —</option>
                            {[...menuItems]
                              .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.nombre} (stock {m.stock})
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="block text-sm font-medium text-[#171717]">
                          Cantidad total *
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={f.cantidadStr}
                            onChange={(e) =>
                              actualizarFila(f.key, { cantidadStr: e.target.value })
                            }
                            className={inputClassComanda}
                          />
                        </label>
                        <div className="flex flex-wrap items-end justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => aplicarFifoFila(f.key)}
                            className="text-xs font-semibold text-[#CD1818] hover:underline"
                          >
                            Sugerir FIFO
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFilas((prev) =>
                                prev.length <= 1 ? prev : prev.filter((x) => x.key !== f.key),
                              )
                            }
                            className="text-xs text-[#8997A6] hover:text-red-600"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>

                      {menu && lotes.length > 0 ? (
                        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                          <table className="w-full min-w-[560px] border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-left text-xs uppercase text-[#8997A6]">
                                <th className="px-3 py-2">Lote</th>
                                <th className="px-3 py-2">Vencimiento</th>
                                <th className="px-3 py-2 text-right">Disponible</th>
                                <th className="px-3 py-2 text-right">Despachar</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {lotes.map((l) => {
                                const lk = loteKeyMenu(l)
                                const estado = obtenerEstadoVencimiento(l.fechaVencimiento)
                                const alerta = esAlertaVencimiento(estado.nivel)
                                return (
                                  <tr
                                    key={lk}
                                    className={alerta ? 'bg-amber-50/40' : undefined}
                                  >
                                    <td className="px-3 py-2 font-mono text-xs">{l.lote}</td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${estado.className}`}
                                      >
                                        {formatFechaVencimiento(l.fechaVencimiento)} ·{' '}
                                        {estado.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {l.cantidad}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        max={l.cantidad}
                                        step={1}
                                        value={f.lotesQty[lk] ?? ''}
                                        onChange={(e) =>
                                          actualizarFila(f.key, {
                                            lotesQty: {
                                              ...f.lotesQty,
                                              [lk]: e.target.value,
                                            },
                                          })
                                        }
                                        className={`ml-auto w-20 rounded-lg border px-2 py-1 text-right text-sm ${
                                          alerta
                                            ? 'border-amber-300 bg-amber-50/50'
                                            : 'border-gray-200'
                                        }`}
                                      />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          {cantidad > 0 ? (
                            <p
                              className={`border-t border-gray-100 px-3 py-2 text-xs ${
                                asignado === cantidad
                                  ? 'text-emerald-700'
                                  : 'font-semibold text-[#CD1818]'
                              }`}
                            >
                              Asignado: {asignado} / {cantidad} viandas
                            </p>
                          ) : null}
                        </div>
                      ) : menu ? (
                        <p className="mt-2 text-sm text-amber-800">
                          Sin lotes en stock. Registrá producción antes de despachar.
                        </p>
                      ) : null}
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setFilas((prev) => [...prev, nuevaFila()])}
                  className="text-sm font-semibold text-[#CD1818] hover:underline"
                >
                  + Agregar vianda al remito
                </button>
              </div>
            </div>

            <label className="block text-sm font-medium text-[#171717]">
              Observaciones
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                className={`${inputClassComanda} resize-y`}
                placeholder="Opcional"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#CD1818] px-6 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-45"
              >
                {isSubmitting ? 'Registrando…' : 'Registrar remito de despacho'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
