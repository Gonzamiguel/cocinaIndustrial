import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Wallet, FileText, CreditCard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  anularFacturaProveedor,
  anularOrdenPago,
} from '../../lib/tesoreria'
import {
  esProveedorTesoreria,
  subscribeFacturasProveedores,
  subscribeOrdenesCompra,
  subscribeOrdenesPago,
  subscribeProveedoresTesoreria,
  type ProveedorTesoreria,
} from '../../lib/tesoreriaQueries'
import {
  formatFechaTimestamp,
  formatMonedaArs,
  formatYmdLegible,
  mensajeErrorTesoreria,
  moneyIgual,
  nombreUsuarioFromAuth,
  roundMoney,
} from '../../lib/tesoreriaUi'
import type { FacturaProveedor, OrdenPago } from '../../types/tesoreria'
import { AnularFacturaDialog } from '../../components/tesoreria/AnularFacturaDialog'
import { AnularOrdenPagoDialog } from '../../components/tesoreria/AnularOrdenPagoDialog'
import { EstadoBadge } from '../../components/tesoreria/EstadoBadge'
import { NuevaFacturaModal } from '../../components/tesoreria/NuevaFacturaModal'
import { NuevaOrdenPagoModal } from '../../components/tesoreria/NuevaOrdenPagoModal'
import type { OrdenCompra } from '../../types/compras'

type TabId = 'cuentas' | 'facturas' | 'ordenesPago'

const tabs: { id: TabId; label: string; Icon: typeof Wallet }[] = [
  { id: 'cuentas', label: 'Cuentas corrientes', Icon: Wallet },
  { id: 'facturas', label: 'Facturas', Icon: FileText },
  { id: 'ordenesPago', label: 'Órdenes de pago', Icon: CreditCard },
]

function facturaTienePagos(f: FacturaProveedor): boolean {
  return !moneyIgual(f.saldoPendiente, f.total)
}

export function TesoreriaDashboardPage() {
  const { user, rol } = useAuth()
  const { showToast } = useToast()
  const puedeEscribir = rol === 'gerencia'

  const [tab, setTab] = useState<TabId>('cuentas')
  const [proveedores, setProveedores] = useState<ProveedorTesoreria[]>([])
  const [facturas, setFacturas] = useState<FacturaProveedor[]>([])
  const [ordenesPago, setOrdenesPago] = useState<OrdenPago[]>([])
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalFactura, setModalFactura] = useState(false)
  const [modalOp, setModalOp] = useState(false)
  const [facturaAnular, setFacturaAnular] = useState<FacturaProveedor | null>(null)
  const [opAnular, setOpAnular] = useState<OrdenPago | null>(null)
  const [anulando, setAnulando] = useState(false)

  const [busquedaCuentas, setBusquedaCuentas] = useState('')
  const [busquedaFacturas, setBusquedaFacturas] = useState('')
  const [filtroEstadoFactura, setFiltroEstadoFactura] = useState<string>('')

  useEffect(() => {
    let pending = 4
    const markReady = () => {
      pending -= 1
      if (pending <= 0) setCargando(false)
    }

    setCargando(true)
    const unsubs = [
      subscribeProveedoresTesoreria((rows) => {
        setProveedores(rows)
        markReady()
      }),
      subscribeFacturasProveedores((rows) => {
        setFacturas(rows)
        markReady()
      }),
      subscribeOrdenesPago((rows) => {
        setOrdenesPago(rows)
        markReady()
      }),
      subscribeOrdenesCompra((rows) => {
        setOrdenesCompra(rows)
        markReady()
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const proveedoresCuentas = useMemo(() => {
    const q = busquedaCuentas.trim().toLowerCase()
    return proveedores
      .filter(esProveedorTesoreria)
      .filter((p) => {
        if (!q) return true
        return (
          p.nombre.toLowerCase().includes(q) ||
          p.cuit.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.saldoCuentaCorriente - a.saldoCuentaCorriente)
  }, [proveedores, busquedaCuentas])

  const totalDeuda = useMemo(
    () => roundMoney(proveedoresCuentas.reduce((acc, p) => acc + p.saldoCuentaCorriente, 0)),
    [proveedoresCuentas],
  )

  const facturasVisibles = useMemo(() => {
    const q = busquedaFacturas.trim().toLowerCase()
    return facturas.filter((f) => {
      if (filtroEstadoFactura && f.estado !== filtroEstadoFactura) return false
      if (!q) return true
      return (
        f.numeroFactura.toLowerCase().includes(q) ||
        f.proveedorNombre.toLowerCase().includes(q) ||
        f.ordenCompraNumero.toLowerCase().includes(q)
      )
    })
  }, [facturas, busquedaFacturas, filtroEstadoFactura])

  async function handleAnularFactura(motivo: string) {
    if (!user || !facturaAnular) return
    setAnulando(true)
    try {
      await anularFacturaProveedor({
        facturaId: facturaAnular.id,
        motivoAnulacion: motivo,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(`Factura ${facturaAnular.numeroFactura} anulada.`, 'success')
      setFacturaAnular(null)
    } catch (err) {
      showToast(mensajeErrorTesoreria(err), 'error')
    } finally {
      setAnulando(false)
    }
  }

  async function handleAnularOp(motivo: string) {
    if (!user || !opAnular) return
    setAnulando(true)
    try {
      await anularOrdenPago({
        ordenPagoId: opAnular.id,
        motivoAnulacion: motivo,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(`OP ${opAnular.numero} anulada.`, 'success')
      setOpAnular(null)
    } catch (err) {
      showToast(mensajeErrorTesoreria(err), 'error')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Finanzas
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
              Tesorería y cuentas por pagar
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Cuentas corrientes de proveedores, facturas registradas contra OC y órdenes de pago
              emitidas.
              {!puedeEscribir ? ' Modo consulta (solo lectura).' : null}
            </p>
          </div>
          {puedeEscribir ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModalFactura(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nueva factura
              </button>
              <button
                type="button"
                onClick={() => setModalOp(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nueva orden de pago
              </button>
            </div>
          ) : null}
        </div>

        <nav
          className="mx-auto mt-4 flex max-w-7xl flex-wrap gap-2 border-t border-neutral-100 pt-4"
          aria-label="Secciones tesorería"
        >
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 sm:py-2.5 ${
                tab === id
                  ? 'bg-[#CD1818] text-white shadow-sm'
                  : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm">Cargando datos de tesorería…</p>
          </div>
        ) : null}

        {!cargando && tab === 'cuentas' ? (
          <section aria-labelledby="tab-cuentas">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="tab-cuentas" className="text-base font-semibold text-neutral-900">
                  Cuentas corrientes
                </h2>
                <p className="text-sm text-neutral-500">
                  Deuda total registrada:{' '}
                  <span className="font-semibold tabular-nums text-neutral-900">
                    {formatMonedaArs(totalDeuda)}
                  </span>
                </p>
              </div>
              <input
                type="search"
                placeholder="Buscar proveedor o CUIT…"
                value={busquedaCuentas}
                onChange={(e) => setBusquedaCuentas(e.target.value)}
                className="min-h-10 w-full max-w-xs rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3 font-semibold">Proveedor</th>
                      <th className="px-4 py-3 font-semibold">CUIT</th>
                      <th className="px-4 py-3 text-right font-semibold">Saldo CC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedoresCuentas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-neutral-500">
                          No hay proveedores para mostrar.
                        </td>
                      </tr>
                    ) : (
                      proveedoresCuentas.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                        >
                          <td className="px-4 py-3 font-medium text-neutral-900">{p.nombre}</td>
                          <td className="px-4 py-3 text-neutral-600">{p.cuit || '—'}</td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${
                              p.saldoCuentaCorriente > 0
                                ? 'text-amber-800'
                                : 'text-neutral-700'
                            }`}
                          >
                            {formatMonedaArs(p.saldoCuentaCorriente)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {!cargando && tab === 'facturas' ? (
          <section aria-labelledby="tab-facturas">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h2 id="tab-facturas" className="text-base font-semibold text-neutral-900">
                Facturas de proveedores
              </h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filtroEstadoFactura}
                  onChange={(e) => setFiltroEstadoFactura(e.target.value)}
                  className="min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40"
                  aria-label="Filtrar por estado"
                >
                  <option value="">Todos los estados</option>
                  <option value="PENDIENTE_PAGO">Pendiente de pago</option>
                  <option value="PAGO_PARCIAL">Pago parcial</option>
                  <option value="PAGADA">Pagada</option>
                  <option value="ANULADA">Anulada</option>
                </select>
                <input
                  type="search"
                  placeholder="Buscar factura, proveedor u OC…"
                  value={busquedaFacturas}
                  onChange={(e) => setBusquedaFacturas(e.target.value)}
                  className="min-h-10 min-w-[220px] rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-3 font-semibold">Nº factura</th>
                      <th className="px-3 py-3 font-semibold">Proveedor</th>
                      <th className="px-3 py-3 font-semibold">OC</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">Vencimiento</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                      {puedeEscribir ? (
                        <th className="px-3 py-3 font-semibold">Acciones</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {facturasVisibles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={puedeEscribir ? 8 : 7}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          No hay facturas con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      facturasVisibles.map((f) => {
                        const conPagos = facturaTienePagos(f)
                        const puedeAnular =
                          puedeEscribir &&
                          f.estado !== 'ANULADA' &&
                          !conPagos
                        return (
                          <tr
                            key={f.id}
                            className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                          >
                            <td className="px-3 py-3 font-medium text-neutral-900">
                              {f.numeroFactura}
                            </td>
                            <td className="px-3 py-3 text-neutral-700">{f.proveedorNombre}</td>
                            <td className="px-3 py-3 font-mono text-xs text-neutral-600">
                              {f.ordenCompraNumero}
                            </td>
                            <td className="px-3 py-3">
                              <EstadoBadge tipo="factura" estado={f.estado} />
                            </td>
                            <td className="px-3 py-3 text-neutral-600">
                              {formatYmdLegible(f.fechaVencimiento)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-neutral-800">
                              {formatMonedaArs(f.total, f.moneda)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums font-medium text-neutral-900">
                              {formatMonedaArs(f.saldoPendiente, f.moneda)}
                            </td>
                            {puedeEscribir ? (
                              <td className="px-3 py-3">
                                {f.estado === 'ANULADA' ? (
                                  <span className="text-xs text-neutral-400">—</span>
                                ) : conPagos ? (
                                  <span
                                    className="cursor-not-allowed text-xs text-neutral-400 underline decoration-dotted"
                                    title="No se puede anular: la factura tiene pagos aplicados. Anulá primero la orden de pago correspondiente."
                                  >
                                    Anular
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!puedeAnular}
                                    onClick={() => setFacturaAnular(f)}
                                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40"
                                  >
                                    Anular
                                  </button>
                                )}
                              </td>
                            ) : null}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {!cargando && tab === 'ordenesPago' ? (
          <section aria-labelledby="tab-op">
            <h2 id="tab-op" className="mb-4 text-base font-semibold text-neutral-900">
              Órdenes de pago
            </h2>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-3 font-semibold">Nº OP</th>
                      <th className="px-3 py-3 font-semibold">Proveedor</th>
                      <th className="px-3 py-3 font-semibold">Fecha pago</th>
                      <th className="px-3 py-3 font-semibold">Método</th>
                      <th className="px-3 py-3 font-semibold">Referencia</th>
                      <th className="px-3 py-3 text-right font-semibold">Monto</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">Facturas</th>
                      {puedeEscribir ? (
                        <th className="px-3 py-3 font-semibold">Acciones</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesPago.length === 0 ? (
                      <tr>
                        <td
                          colSpan={puedeEscribir ? 9 : 8}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          No hay órdenes de pago registradas.
                        </td>
                      </tr>
                    ) : (
                      ordenesPago.map((op) => (
                        <tr
                          key={op.id}
                          className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                        >
                          <td className="px-3 py-3 font-mono text-xs font-semibold text-neutral-900">
                            {op.numero}
                          </td>
                          <td className="px-3 py-3 text-neutral-700">{op.proveedorNombre}</td>
                          <td className="px-3 py-3 text-neutral-600">
                            {formatFechaTimestamp(op.fechaPago)}
                          </td>
                          <td className="px-3 py-3 text-neutral-600">{op.metodoPago}</td>
                          <td className="max-w-[140px] truncate px-3 py-3 text-neutral-600" title={op.referenciaPago}>
                            {op.referenciaPago}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium text-neutral-900">
                            {formatMonedaArs(op.montoTotal)}
                          </td>
                          <td className="px-3 py-3">
                            <EstadoBadge tipo="ordenPago" estado={op.estado} />
                          </td>
                          <td className="px-3 py-3 text-xs text-neutral-600">
                            {op.facturasAplicadas?.length
                              ? op.facturasAplicadas
                                  .map((fa) => fa.numeroFactura)
                                  .join(', ')
                              : '—'}
                          </td>
                          {puedeEscribir ? (
                            <td className="px-3 py-3">
                              {op.estado === 'EMITIDA' ? (
                                <button
                                  type="button"
                                  onClick={() => setOpAnular(op)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                                >
                                  Anular OP
                                </button>
                              ) : (
                                <span className="text-xs text-neutral-400">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <NuevaFacturaModal
        open={modalFactura}
        onClose={() => setModalFactura(false)}
        proveedores={proveedores}
        ordenesCompra={ordenesCompra}
      />

      <NuevaOrdenPagoModal
        open={modalOp}
        onClose={() => setModalOp(false)}
        proveedores={proveedores}
        facturas={facturas}
      />

      <AnularFacturaDialog
        open={Boolean(facturaAnular)}
        numeroFactura={facturaAnular?.numeroFactura ?? ''}
        isWorking={anulando}
        onConfirm={(motivo) => void handleAnularFactura(motivo)}
        onCancel={() => {
          if (!anulando) setFacturaAnular(null)
        }}
      />

      <AnularOrdenPagoDialog
        open={Boolean(opAnular)}
        numeroOp={opAnular?.numero ?? ''}
        isWorking={anulando}
        onConfirm={(motivo) => void handleAnularOp(motivo)}
        onCancel={() => {
          if (!anulando) setOpAnular(null)
        }}
      />
    </div>
  )
}
