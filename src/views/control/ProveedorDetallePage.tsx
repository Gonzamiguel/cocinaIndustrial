import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Paperclip,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import { ListaComprobantesLegajo } from '../../components/compras/ListaComprobantesLegajo'
import { ListaPreciosProveedorPanel } from '../../components/compras/ListaPreciosProveedorPanel'
import { EstadoOcBadge } from '../../components/compras/EstadoOcBadge'
import { EstadoBadge } from '../../components/tesoreria/EstadoBadge'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { exportarLegajoProveedorPdf } from '../../lib/comprasExpedientePdf'
import { subscribeLegajoProveedor, type LegajoProveedorData } from '../../lib/comprasQueries'
import { puedeOperarFinanzas } from '../../lib/rbac'
import {
  formatMonedaCompra,
  formatYmdLegible,
} from '../../lib/comprasUi'
import {
  formatMonedaArs,
  formatYmdLegible as formatYmdTesoreria,
  formatFechaTimestamp,
} from '../../lib/tesoreriaUi'

type TabLegajo = 'comprobantes' | 'ordenes' | 'facturas' | 'pagos' | 'listasPrecio'

const cardClass =
  'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6'

function etiquetaCondicionIva(c: string): string {
  switch (c) {
    case 'RESPONSABLE_INSCRIPTO':
      return 'Responsable inscripto'
    case 'MONOTRIBUTO':
      return 'Monotributo'
    case 'EXENTO':
      return 'Exento'
    default:
      return c.replace(/_/g, ' ')
  }
}

export function ProveedorDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { rol } = useAuth()
  const { showToast } = useToast()
  const puedeEscribir = puedeOperarFinanzas(rol)
  const [tab, setTab] = useState<TabLegajo>('comprobantes')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [legajo, setLegajo] = useState<LegajoProveedorData | null>(null)

  useEffect(() => {
    if (!id?.trim()) {
      setError('Identificador de proveedor inválido.')
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    const unsub = subscribeLegajoProveedor(
      id,
      (data) => {
        if (!data.proveedor) {
          setError('No se encontró el proveedor solicitado.')
        } else {
          setError(null)
        }
        setLegajo(data)
        setCargando(false)
      },
      (msg) => setError(msg),
    )
    return () => unsub()
  }, [id])

  const numerosOc = useMemo(() => {
    const map: Record<string, string> = {}
    for (const oc of legajo?.ordenes ?? []) {
      map[oc.id] = oc.numero
    }
    return map
  }, [legajo?.ordenes])

  const resumen = useMemo(() => {
    if (!legajo) return null
    const remitos = legajo.documentos.filter((d) => d.tipoComprobante === 'REMITO').length
    const facturasPdf = legajo.documentos.filter((d) => d.tipoComprobante === 'FACTURA').length
    const comprobantesPago = legajo.documentos.filter(
      (d) => d.tipoComprobante === 'COMPROBANTE_PAGO',
    ).length
    const listasPrecio = legajo.documentos.filter(
      (d) => d.tipoComprobante === 'LISTA_PRECIOS',
    ).length
    return {
      totalOcs: legajo.ordenes.filter((oc) => oc.estado !== 'CANCELADA').length,
      totalFacturas: legajo.facturas.filter((f) => f.estado !== 'ANULADA').length,
      totalOps: legajo.ordenesPago.filter((op) => op.estado !== 'ANULADA').length,
      remitos,
      facturasPdf,
      comprobantesPago,
      listasPrecio,
      totalDocumentos: legajo.documentos.length,
    }
  }, [legajo])

  function handleExportarLegajoPdf() {
    if (!legajo) return
    try {
      exportarLegajoProveedorPdf(legajo)
      showToast('Legajo del proveedor exportado a PDF.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo exportar el PDF.', 'error')
    }
  }

  const documentosSinListas = useMemo(() => {
    if (!legajo) return []
    return legajo.documentos.filter((d) => d.tipoComprobante !== 'LISTA_PRECIOS')
  }, [legajo])

  const tabClass = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'bg-[#CD1818] text-white shadow-sm'
        : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
    }`

  if (cargando && !legajo?.proveedor) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-neutral-50 py-24 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
        <p className="text-sm">Cargando legajo del proveedor…</p>
      </div>
    )
  }

  if (error || !legajo?.proveedor) {
    return (
      <div className="mx-auto flex min-h-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error ?? 'Proveedor no encontrado.'}
        </p>
        <Link
          to="/control/proveedores"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#CD1818] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a proveedores
        </Link>
      </div>
    )
  }

  const proveedor = legajo.proveedor

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/control/proveedores"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-[#CD1818]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver al padrón de proveedores
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#CD1818]/10 text-[#CD1818]">
                <FolderOpen className="h-7 w-7" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Perfil del proveedor · Legajo digital
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">
                  {proveedor.razonSocial}
                </h1>
                <p className="mt-1 text-sm text-neutral-600">
                  CUIT {proveedor.cuit || '—'} · {etiquetaCondicionIva(proveedor.condicionIva)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportarLegajoPdf}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
              >
                <Download className="h-4 w-4 text-[#CD1818]" aria-hidden />
                Exportar legajo PDF
              </button>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  proveedor.proveedorActivo
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {proveedor.proveedorActivo ? 'Activo' : 'Inactivo'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                <RefreshCw className="h-3 w-3" aria-hidden />
                Actualización en vivo
              </span>
            </div>
          </div>

          {resumen ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">OC</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">
                  {resumen.totalOcs}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Facturas
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">
                  {resumen.totalFacturas}
                </p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                  Remitos
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-blue-900">
                  {resumen.remitos}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                  PDF facturas
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">
                  {resumen.facturasPdf}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={tabClass(tab === 'comprobantes')} onClick={() => setTab('comprobantes')}>
              <Paperclip className="h-4 w-4" aria-hidden />
              Comprobantes
              {resumen && resumen.totalDocumentos > 0 ? (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">
                  {resumen.totalDocumentos}
                </span>
              ) : null}
            </button>
            <button type="button" className={tabClass(tab === 'ordenes')} onClick={() => setTab('ordenes')}>
              <FileText className="h-4 w-4" aria-hidden />
              Órdenes de compra
            </button>
            <button type="button" className={tabClass(tab === 'facturas')} onClick={() => setTab('facturas')}>
              <Receipt className="h-4 w-4" aria-hidden />
              Facturas
            </button>
            <button type="button" className={tabClass(tab === 'pagos')} onClick={() => setTab('pagos')}>
              <CreditCard className="h-4 w-4" aria-hidden />
              Pagos
              {resumen && resumen.totalOps > 0 ? (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">
                  {resumen.totalOps}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={tabClass(tab === 'listasPrecio')}
              onClick={() => setTab('listasPrecio')}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Listas de precio
              {resumen && resumen.listasPrecio > 0 ? (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">
                  {resumen.listasPrecio}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Datos fiscales y contacto
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">Domicilio fiscal</dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {[proveedor.direccionFiscal, proveedor.localidad, proveedor.provincia]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Contacto</dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {[proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Plazo de pago</dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {proveedor.plazoPagoDias} días · {proveedor.monedaDefault}
              </dd>
            </div>
          </dl>
        </section>

        {tab === 'comprobantes' ? (
          <section className={cardClass}>
            <h2 className="mb-2 text-base font-semibold text-neutral-900">
              Comprobantes archivados
            </h2>
            <p className="mb-4 text-sm text-neutral-500">
              Remitos de depósito, facturas PDF, comprobantes de pago y otros archivos vinculados a
              este proveedor.
            </p>
            <ListaComprobantesLegajo
              documentos={documentosSinListas}
              numerosOc={numerosOc}
              vacio="Todavía no hay comprobantes. Aparecerán cuando depósito confirme un ingreso con foto/PDF o cuando finanzas adjunte una factura."
            />
          </section>
        ) : null}

        {tab === 'ordenes' ? (
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Órdenes de compra</h2>
            {legajo.ordenes.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin órdenes de compra emitidas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-2 py-2 font-semibold">Nº OC</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 font-semibold">Entrega</th>
                      <th className="px-2 py-2 text-right font-semibold">Total</th>
                      <th className="px-2 py-2 font-semibold">Expediente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legajo.ordenes.map((oc) => (
                      <tr key={oc.id} className="border-b border-neutral-50">
                        <td className="px-2 py-2.5 font-mono text-xs font-semibold">{oc.numero}</td>
                        <td className="px-2 py-2.5">
                          <EstadoOcBadge estado={oc.estado} />
                        </td>
                        <td className="px-2 py-2.5 text-neutral-600">
                          {formatYmdLegible(oc.fechaEntregaEstimada)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatMonedaCompra(oc.total, oc.moneda)}
                        </td>
                        <td className="px-2 py-2.5">
                          <Link
                            to={`/control/compras/${oc.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#CD1818] hover:underline"
                          >
                            Ver expediente
                            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'facturas' ? (
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Facturas registradas</h2>
            {legajo.facturas.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin facturas en tesorería.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-2 py-2 font-semibold">Nº factura</th>
                      <th className="px-2 py-2 font-semibold">OC</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 font-semibold">Vencimiento</th>
                      <th className="px-2 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legajo.facturas.map((f) => (
                      <tr key={f.id} className="border-b border-neutral-50">
                        <td className="px-2 py-2.5 font-medium">{f.numeroFactura}</td>
                        <td className="px-2 py-2.5">
                          <Link
                            to={`/control/compras/${f.ordenCompraId}`}
                            className="font-mono text-xs text-[#CD1818] hover:underline"
                          >
                            {f.ordenCompraNumero}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5">
                          <EstadoBadge tipo="factura" estado={f.estado} />
                        </td>
                        <td className="px-2 py-2.5 text-neutral-600">
                          {formatYmdTesoreria(f.fechaVencimiento)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatMonedaArs(f.total, f.moneda)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'pagos' ? (
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Órdenes de pago</h2>
            {legajo.ordenesPago.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin órdenes de pago emitidas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-2 py-2 font-semibold">Nº OP</th>
                      <th className="px-2 py-2 font-semibold">Fecha</th>
                      <th className="px-2 py-2 font-semibold">Método</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 text-right font-semibold">Monto</th>
                      <th className="px-2 py-2 font-semibold">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legajo.ordenesPago.map((op) => {
                      const comprobantes = legajo.documentos.filter(
                        (d) =>
                          d.entidadId === op.id &&
                          d.tipoComprobante === 'COMPROBANTE_PAGO',
                      )
                      return (
                        <tr key={op.id} className="border-b border-neutral-50">
                          <td className="px-2 py-2.5 font-mono text-xs font-semibold">{op.numero}</td>
                          <td className="px-2 py-2.5 text-neutral-600">
                            {formatFechaTimestamp(op.fechaPago)}
                          </td>
                          <td className="px-2 py-2.5 text-neutral-600">{op.metodoPago}</td>
                          <td className="px-2 py-2.5">
                            <EstadoBadge tipo="ordenPago" estado={op.estado} />
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {formatMonedaArs(op.montoTotal)}
                          </td>
                          <td className="px-2 py-2.5">
                            {comprobantes.length > 0 ? (
                              <a
                                href={comprobantes[0].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#CD1818] hover:underline"
                              >
                                <Paperclip className="h-3 w-3" aria-hidden />
                                Ver ({comprobantes.length})
                              </a>
                            ) : (
                              <span className="text-xs text-neutral-400">Sin archivo</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'listasPrecio' && legajo.proveedor ? (
          <section className={cardClass}>
            <h2 className="mb-2 text-base font-semibold text-neutral-900">Listas de precios</h2>
            <p className="mb-4 text-sm text-neutral-500">
              Archivá PDF o Excel que el proveedor comparta. Quedan en el legajo para consulta al
              crear órdenes de compra.
            </p>
            <ListaPreciosProveedorPanel
              proveedorId={legajo.proveedor.id}
              documentos={legajo.documentos}
              onDocumentosChange={(docs) =>
                setLegajo((prev) => (prev ? { ...prev, documentos: docs } : prev))
              }
              puedeSubir={puedeEscribir}
            />
          </section>
        ) : null}
      </div>
    </div>
  )
}
