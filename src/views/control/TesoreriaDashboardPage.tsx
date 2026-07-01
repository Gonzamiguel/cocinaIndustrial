import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarClock, ClipboardList, ExternalLink, Loader2, Paperclip, Plus, Wallet, FileText, CreditCard } from 'lucide-react'
import { AdjuntarComprobantePagoModal } from '../../components/tesoreria/AdjuntarComprobantePagoModal'
import { ocTieneComprobanteDeposito } from '../../lib/comprasQueries'
import { subscribeDocumentosPorEntidadTipo } from '../../lib/documentos'
import type { DocumentoAdjunto } from '../../types/documentos'
import { ProveedorPerfilLink } from '../../components/compras/ProveedorPerfilLink'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { puedeOperarFinanzas } from '../../lib/rbac'
import {
  anularFacturaProveedor,
  anularOrdenPago,
} from '../../lib/tesoreria'
import {
  esProveedorTesoreria,
  filtrarOcPendientesFacturar,
  fechaRecepcionOc,
  montoFacturadoOc,
  saldoAFacturarOc,
  subscribeFacturasProveedores,
  subscribeOrdenesCompra,
  subscribeOrdenesPago,
  subscribeProveedoresTesoreria,
  type ProveedorTesoreria,
} from '../../lib/tesoreriaQueries'
import {
  estiloBadgeUrgenciaVencimiento,
  formatFechaTimestamp,
  formatMonedaArs,
  formatYmdLegible,
  hoyYmdLocal,
  mensajeErrorTesoreria,
  moneyIgual,
  nombreUsuarioFromAuth,
  roundMoney,
  urgenciaVencimiento,
} from '../../lib/tesoreriaUi'
import type { FacturaProveedor, OrdenPago } from '../../types/tesoreria'
import { AnularFacturaDialog } from '../../components/tesoreria/AnularFacturaDialog'
import { AnularOrdenPagoDialog } from '../../components/tesoreria/AnularOrdenPagoDialog'
import { EstadoBadge } from '../../components/tesoreria/EstadoBadge'
import { NuevaFacturaModal } from '../../components/tesoreria/NuevaFacturaModal'
import { NuevaOrdenPagoModal } from '../../components/tesoreria/NuevaOrdenPagoModal'
import type { OrdenCompra } from '../../types/compras'

type TabId = 'cuentas' | 'pendientesFacturar' | 'vencimientos' | 'facturas' | 'ordenesPago'

const tabs: { id: TabId; label: string; Icon: typeof Wallet }[] = [
  { id: 'cuentas', label: 'Cuentas corrientes', Icon: Wallet },
  { id: 'pendientesFacturar', label: 'Pendientes de facturar', Icon: ClipboardList },
  { id: 'vencimientos', label: 'Vencimientos', Icon: CalendarClock },
  { id: 'facturas', label: 'Facturas', Icon: FileText },
  { id: 'ordenesPago', label: 'Órdenes de pago', Icon: CreditCard },
]

function facturaTienePagos(f: FacturaProveedor): boolean {
  return !moneyIgual(f.saldoPendiente, f.total)
}

export function TesoreriaDashboardPage() {
  const { user, rol } = useAuth()
  const { showToast } = useToast()
  const puedeEscribir = puedeOperarFinanzas(rol)

  const [tab, setTab] = useState<TabId>('cuentas')
  const [proveedores, setProveedores] = useState<ProveedorTesoreria[]>([])
  const [facturas, setFacturas] = useState<FacturaProveedor[]>([])
  const [ordenesPago, setOrdenesPago] = useState<OrdenPago[]>([])
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalFactura, setModalFactura] = useState(false)
  const [facturaOcPreset, setFacturaOcPreset] = useState<{
    ordenCompraId: string
    proveedorId: string
  } | null>(null)
  const [modalOp, setModalOp] = useState(false)
  const [facturaAnular, setFacturaAnular] = useState<FacturaProveedor | null>(null)
  const [opAnular, setOpAnular] = useState<OrdenPago | null>(null)
  const [anulando, setAnulando] = useState(false)

  const [busquedaCuentas, setBusquedaCuentas] = useState('')
  const [busquedaFacturas, setBusquedaFacturas] = useState('')
  const [filtroEstadoFactura, setFiltroEstadoFactura] = useState<string>('')
  const [documentosOp, setDocumentosOp] = useState<DocumentoAdjunto[]>([])
  const [documentosOc, setDocumentosOc] = useState<DocumentoAdjunto[]>([])
  const [opComprobanteModal, setOpComprobanteModal] = useState<OrdenPago | null>(null)

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

  useEffect(() => {
    const unsubs = [
      subscribeDocumentosPorEntidadTipo('ORDEN_PAGO', setDocumentosOp),
      subscribeDocumentosPorEntidadTipo('ORDEN_COMPRA', setDocumentosOc),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const comprobantesPorOp = useMemo(() => {
    const map = new Map<string, DocumentoAdjunto[]>()
    for (const doc of documentosOp) {
      if (doc.tipoComprobante !== 'COMPROBANTE_PAGO') continue
      const list = map.get(doc.entidadId) ?? []
      list.push(doc)
      map.set(doc.entidadId, list)
    }
    return map
  }, [documentosOp])

  const documentosPorOcId = useMemo(() => {
    const map = new Map<string, DocumentoAdjunto[]>()
    for (const doc of documentosOc) {
      const ocId = doc.ordenCompraId?.trim() || doc.entidadId
      if (!ocId) continue
      const list = map.get(ocId) ?? []
      list.push(doc)
      map.set(ocId, list)
    }
    return map
  }, [documentosOc])

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
      .sort((a, b) => b.saldoProveedor - a.saldoProveedor)
  }, [proveedores, busquedaCuentas])

  const totalDeuda = useMemo(
    () => roundMoney(proveedoresCuentas.reduce((acc, p) => acc + p.saldoProveedor, 0)),
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

  const ocPendientesFacturar = useMemo(
    () => filtrarOcPendientesFacturar(ordenesCompra),
    [ordenesCompra],
  )

  const facturasConVencimiento = useMemo(() => {
    const hoy = hoyYmdLocal()
    return facturas
      .filter((f) => f.estado === 'PENDIENTE_PAGO' || f.estado === 'PAGO_PARCIAL')
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
      .map((f) => ({
        factura: f,
        urgencia: urgenciaVencimiento(f.fechaVencimiento, hoy),
      }))
  }, [facturas])

  function abrirModalFacturaLibre() {
    setFacturaOcPreset(null)
    setModalFactura(true)
  }

  function abrirModalFacturaDesdeOc(oc: (typeof ocPendientesFacturar)[number]) {
    setFacturaOcPreset({ ordenCompraId: oc.id, proveedorId: oc.proveedorId })
    setModalFactura(true)
  }

  function cerrarModalFactura() {
    setModalFactura(false)
    setFacturaOcPreset(null)
  }

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
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              Tesorería y cuentas por pagar
            </h1>
          </div>
          {puedeEscribir ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={abrirModalFacturaLibre}
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
                      <th className="px-4 py-3 text-right font-semibold">Deuda (proveedor)</th>
                      <th className="px-4 py-3 font-semibold">Legajo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedoresCuentas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
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
                              p.saldoProveedor > 0
                                ? 'text-amber-800'
                                : 'text-neutral-700'
                            }`}
                          >
                            {formatMonedaArs(p.saldoProveedor)}
                          </td>
                          <td className="px-4 py-3">
                            <ProveedorPerfilLink proveedorId={p.id} variant="button" />
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

        {!cargando && tab === 'pendientesFacturar' ? (
          <section aria-labelledby="tab-pendientes-facturar">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="tab-pendientes-facturar" className="text-base font-semibold text-neutral-900">
                  Pendientes de facturar
                </h2>
                <p className="text-sm text-neutral-500">
                  OC recibidas en depósito con saldo contable sin registrar en factura.
                </p>
              </div>
              {puedeEscribir ? (
                <p className="text-sm font-medium text-neutral-700">
                  {ocPendientesFacturar.length} OC con saldo pendiente
                </p>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-3 font-semibold">Nº OC</th>
                      <th className="px-3 py-3 font-semibold">Proveedor</th>
                      <th className="px-3 py-3 font-semibold">Fecha recepción</th>
                      <th className="px-3 py-3 text-right font-semibold">Total OC</th>
                      <th className="px-3 py-3 text-right font-semibold">Facturado</th>
                      <th className="px-3 py-3 text-right font-semibold">Saldo a facturar</th>
                      <th className="px-3 py-3 font-semibold">Comprob. depósito</th>
                      {puedeEscribir ? (
                        <th className="px-3 py-3 font-semibold">Acción</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ocPendientesFacturar.length === 0 ? (
                      <tr>
                        <td
                          colSpan={puedeEscribir ? 8 : 7}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          No hay OC pendientes de facturar.
                        </td>
                      </tr>
                    ) : (
                      ocPendientesFacturar.map((oc) => {
                        const fechaRec = fechaRecepcionOc(oc)
                        const facturado = montoFacturadoOc(oc)
                        const saldo = saldoAFacturarOc(oc)
                        const docsOc = documentosPorOcId.get(oc.id) ?? []
                        const tieneComprobante = ocTieneComprobanteDeposito(docsOc)
                        return (
                          <tr
                            key={oc.id}
                            className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                          >
                            <td className="px-3 py-3 font-mono text-xs font-semibold text-neutral-900">
                              <Link
                                to={`/control/compras/${oc.id}`}
                                className="inline-flex items-center gap-1 text-[#CD1818] hover:underline"
                                title="Ver expediente"
                              >
                                {oc.numero}
                                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-neutral-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{oc.proveedorNombre}</span>
                                <ProveedorPerfilLink
                                  proveedorId={oc.proveedorId}
                                  variant="icon"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-neutral-600">
                              {fechaRec ? fechaRec.toLocaleDateString('es-AR') : '—'}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-neutral-800">
                              {formatMonedaArs(oc.total, oc.moneda)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-neutral-600">
                              {formatMonedaArs(facturado, oc.moneda)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums font-semibold text-amber-800">
                              {formatMonedaArs(saldo, oc.moneda)}
                            </td>
                            <td className="px-3 py-3">
                              {tieneComprobante ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  <Paperclip className="h-3 w-3" aria-hidden />
                                  Archivado
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-400">Sin archivo</span>
                              )}
                            </td>
                            {puedeEscribir ? (
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  onClick={() => abrirModalFacturaDesdeOc(oc)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#CD1818]/10 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/15"
                                >
                                  <Plus className="h-3.5 w-3.5" aria-hidden />
                                  Cargar factura
                                </button>
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

        {!cargando && tab === 'vencimientos' ? (
          <section aria-labelledby="tab-vencimientos">
            <div className="mb-4">
              <h2 id="tab-vencimientos" className="text-base font-semibold text-neutral-900">
                Próximos vencimientos
              </h2>
              <p className="text-sm text-neutral-500">
                Facturas con saldo pendiente ordenadas por fecha de vencimiento.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-3 font-semibold">Urgencia</th>
                      <th className="px-3 py-3 font-semibold">Nº factura</th>
                      <th className="px-3 py-3 font-semibold">Proveedor</th>
                      <th className="px-3 py-3 font-semibold">OC</th>
                      <th className="px-3 py-3 font-semibold">Vencimiento</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturasConVencimiento.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                          No hay facturas con saldo pendiente.
                        </td>
                      </tr>
                    ) : (
                      facturasConVencimiento.map(({ factura: f, urgencia }) => {
                        const badge = estiloBadgeUrgenciaVencimiento(urgencia)
                        return (
                          <tr
                            key={f.id}
                            className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                          >
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${badge.className}`}
                              >
                                {urgencia === 'VENCIDA' ? (
                                  <AlertCircle className="h-3 w-3" aria-hidden />
                                ) : null}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-medium text-neutral-900">
                              {f.numeroFactura}
                            </td>
                            <td className="px-3 py-3 text-neutral-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{f.proveedorNombre}</span>
                                <ProveedorPerfilLink proveedorId={f.proveedorId} variant="icon" />
                              </div>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-neutral-600">
                              {f.ordenCompraNumero}
                            </td>
                            <td className="px-3 py-3 text-neutral-600">
                              {formatYmdLegible(f.fechaVencimiento)}
                            </td>
                            <td className="px-3 py-3">
                              <EstadoBadge tipo="factura" estado={f.estado} />
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums font-medium text-neutral-900">
                              {formatMonedaArs(f.saldoPendiente, f.moneda)}
                            </td>
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
                            <td className="px-3 py-3 text-neutral-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{f.proveedorNombre}</span>
                                <ProveedorPerfilLink proveedorId={f.proveedorId} variant="icon" />
                              </div>
                            </td>
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
                      <th className="px-3 py-3 font-semibold">Comprobante</th>
                      {puedeEscribir ? (
                        <th className="px-3 py-3 font-semibold">Acciones</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesPago.length === 0 ? (
                      <tr>
                        <td
                          colSpan={puedeEscribir ? 10 : 9}
                          className="px-4 py-10 text-center text-neutral-500"
                        >
                          No hay órdenes de pago registradas.
                        </td>
                      </tr>
                    ) : (
                      ordenesPago.map((op) => {
                        const comprobantes = comprobantesPorOp.get(op.id) ?? []
                        const tieneComprobante = comprobantes.length > 0
                        return (
                        <tr
                          key={op.id}
                          className="border-b border-neutral-50 transition hover:bg-neutral-50/60"
                        >
                          <td className="px-3 py-3 font-mono text-xs font-semibold text-neutral-900">
                            {op.numero}
                          </td>
                          <td className="px-3 py-3 text-neutral-700">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{op.proveedorNombre}</span>
                              <ProveedorPerfilLink proveedorId={op.proveedorId} variant="icon" />
                            </div>
                          </td>
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
                          <td className="px-3 py-3">
                            {op.estado === 'EMITIDA' && tieneComprobante ? (
                              <a
                                href={comprobantes[0]?.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                Ver ({comprobantes.length})
                              </a>
                            ) : op.estado === 'EMITIDA' && puedeEscribir ? (
                              <button
                                type="button"
                                onClick={() => setOpComprobanteModal(op)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#CD1818]/10 px-2.5 py-1 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/15"
                              >
                                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                Adjuntar
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                            {op.estado === 'EMITIDA' && tieneComprobante && puedeEscribir ? (
                              <button
                                type="button"
                                onClick={() => setOpComprobanteModal(op)}
                                className="mt-1 block text-[11px] font-medium text-neutral-500 hover:text-[#CD1818]"
                              >
                                + otro archivo
                              </button>
                            ) : null}
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
                        )
                      })
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
        onClose={cerrarModalFactura}
        proveedores={proveedores}
        ordenesCompra={ordenesCompra}
        ordenCompraIdInicial={facturaOcPreset?.ordenCompraId}
        proveedorIdInicial={facturaOcPreset?.proveedorId}
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

      <AdjuntarComprobantePagoModal
        open={Boolean(opComprobanteModal)}
        onClose={() => setOpComprobanteModal(null)}
        ordenPago={opComprobanteModal}
        documentos={documentosOp}
        onDocumentoSubido={(doc) => {
          setDocumentosOp((prev) => {
            const idx = prev.findIndex((d) => d.id === doc.id)
            if (idx >= 0) return prev
            return [doc, ...prev]
          })
        }}
      />
    </div>
  )
}
