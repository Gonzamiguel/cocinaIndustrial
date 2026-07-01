import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Loader2,
  PackageCheck,
  Paperclip,
  Receipt,
} from 'lucide-react'
import { DocumentosAdjuntosPanel } from '../../components/compras/DocumentosAdjuntosPanel'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { exportarExpedienteOcPdf } from '../../lib/comprasExpedientePdf'
import {
  evaluarMatchTresVias,
  subscribeExpedienteOc,
  type RecepcionOcResumen,
} from '../../lib/comprasQueries'
import { ProveedorPerfilLink } from '../../components/compras/ProveedorPerfilLink'
import {
  formatFechaTimestamp,
  formatMonedaCompra,
  formatYmdLegible,
} from '../../lib/comprasUi'
import { puedeOperarFinanzas } from '../../lib/rbac'
import { montoFacturadoOc, saldoAFacturarOc } from '../../lib/tesoreriaQueries'
import {
  formatFechaTimestamp as formatFechaTesoreria,
  formatMonedaArs,
  formatYmdLegible as formatYmdTesoreria,
} from '../../lib/tesoreriaUi'
import { EstadoOcBadge } from '../../components/compras/EstadoOcBadge'
import { EstadoBadge } from '../../components/tesoreria/EstadoBadge'
import type { OrdenCompra } from '../../types/compras'
import type { DocumentoAdjunto } from '../../types/documentos'
import type { FacturaProveedor } from '../../types/tesoreria'

const cardClass =
  'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6'

function ItemMatch({
  ok,
  label,
  detalle,
}: {
  ok: boolean
  label: string
  detalle?: string
}) {
  const Icon = ok ? CheckCircle2 : Circle
  return (
    <li className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/80 px-4 py-3">
      <Icon
        className={`mt-0.5 h-5 w-5 shrink-0 ${ok ? 'text-emerald-600' : 'text-neutral-300'}`}
        aria-hidden
      />
      <div>
        <p className={`text-sm font-medium ${ok ? 'text-neutral-900' : 'text-neutral-600'}`}>
          {label}
        </p>
        {detalle ? <p className="mt-0.5 text-xs text-neutral-500">{detalle}</p> : null}
      </div>
    </li>
  )
}

function pctFacturado(oc: OrdenCompra): number {
  if (oc.total <= 0) return 0
  return Math.min(100, Math.round((montoFacturadoOc(oc) / oc.total) * 100))
}

function pctRecepcionFisica(oc: OrdenCompra): number {
  const lineas = oc.items.filter((it) => it.estadoLinea !== 'CANCELADA')
  if (lineas.length === 0) return 0
  const solicitado = lineas.reduce((acc, it) => acc + it.cantidadSolicitada, 0)
  const recibido = lineas.reduce((acc, it) => acc + it.cantidadRecibida, 0)
  if (solicitado <= 0) return 0
  return Math.min(100, Math.round((recibido / solicitado) * 100))
}

export function OcDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { rol } = useAuth()
  const { showToast } = useToast()
  const puedeSubir = puedeOperarFinanzas(rol)

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<OrdenCompra | null>(null)
  const [recepciones, setRecepciones] = useState<RecepcionOcResumen[]>([])
  const [facturas, setFacturas] = useState<FacturaProveedor[]>([])
  const [documentos, setDocumentos] = useState<DocumentoAdjunto[]>([])

  useEffect(() => {
    if (!id?.trim()) {
      setError('Identificador de OC inválido.')
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    const unsub = subscribeExpedienteOc(
      id,
      (data) => {
        if (!data.orden) {
          setError('No se encontró la orden de compra solicitada.')
        } else {
          setError(null)
        }
        setOrden(data.orden)
        setRecepciones(data.recepciones)
        setFacturas(data.facturas)
        setDocumentos(data.documentos)
        setCargando(false)
      },
      (msg) => setError(msg),
    )
    return () => unsub()
  }, [id])

  const resumenMatch = useMemo(() => {
    if (!orden) return null
    return {
      pctRecibido: pctRecepcionFisica(orden),
      pctFacturado: pctFacturado(orden),
      facturado: montoFacturadoOc(orden),
      saldoFacturar: saldoAFacturarOc(orden),
    }
  }, [orden])

  const matchTresVias = useMemo(() => {
    if (!orden) return null
    return evaluarMatchTresVias({ orden, recepciones, facturas, documentos })
  }, [orden, recepciones, facturas, documentos])

  function handleExportarPdf() {
    if (!orden) return
    try {
      exportarExpedienteOcPdf(
        { orden, recepciones, facturas, documentos },
        matchTresVias,
      )
      showToast(`Expediente ${orden.numero} exportado a PDF.`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo exportar el PDF.', 'error')
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-neutral-50 py-24 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
        <p className="text-sm">Cargando expediente…</p>
      </div>
    )
  }

  if (error || !orden) {
    return (
      <div className="mx-auto flex min-h-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error ?? 'Orden de compra no encontrada.'}
        </p>
        <Link
          to="/control/compras"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#CD1818] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a compras
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/control/compras"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-[#CD1818]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a bandeja de compras
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Expediente digital · Match 3 vías
              </p>
              <h1 className="mt-1 font-mono text-xl font-bold tracking-tight text-neutral-900">
                {orden.numero}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-sm text-neutral-600">{orden.proveedorNombre}</p>
                <ProveedorPerfilLink proveedorId={orden.proveedorId} variant="button" />
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <EstadoOcBadge estado={orden.estado} />
              <button
                type="button"
                onClick={handleExportarPdf}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50"
              >
                <Download className="h-4 w-4 text-[#CD1818]" aria-hidden />
                Exportar PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* Tarjeta 1 — Cabecera */}
        <section className={cardClass} aria-labelledby="oc-cabecera">
          <h2 id="oc-cabecera" className="mb-4 text-base font-semibold text-neutral-900">
            Resumen del expediente
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Emisión
              </dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {formatFechaTimestamp(orden.fechaEmision)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Entrega estimada
              </dt>
              <dd className="mt-1 text-sm text-neutral-800">
                {formatYmdLegible(orden.fechaEntregaEstimada)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Condición de pago
              </dt>
              <dd className="mt-1 text-sm text-neutral-800">{orden.condicionPago}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Total OC
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                {formatMonedaCompra(orden.total, orden.moneda)}
              </dd>
            </div>
          </dl>

          {resumenMatch ? (
            <div className="mt-6 grid gap-4 border-t border-neutral-100 pt-6 lg:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-700">Recepción física (depósito)</span>
                  <span className="tabular-nums text-neutral-600">{resumenMatch.pctRecibido}%</span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-valuenow={resumenMatch.pctRecibido}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Porcentaje recibido en depósito"
                >
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${resumenMatch.pctRecibido}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-700">Facturación registrada</span>
                  <span className="tabular-nums text-neutral-600">
                    {formatMonedaCompra(resumenMatch.facturado, orden.moneda)} ·{' '}
                    {resumenMatch.pctFacturado}%
                  </span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  aria-valuenow={resumenMatch.pctFacturado}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Porcentaje facturado"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${resumenMatch.pctFacturado}%` }}
                  />
                </div>
                {resumenMatch.saldoFacturar > 0.02 ? (
                  <p className="mt-1.5 text-xs text-amber-800">
                    Saldo pendiente de facturar:{' '}
                    {formatMonedaCompra(resumenMatch.saldoFacturar, orden.moneda)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {matchTresVias ? (
          <section
            className={`${cardClass} ${
              matchTresVias.expedienteCompleto ? 'border-emerald-200 bg-emerald-50/30' : ''
            }`}
            aria-labelledby="oc-match"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="oc-match" className="text-base font-semibold text-neutral-900">
                  Match de 3 vías
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  OC + remito de depósito + factura del proveedor deben coincidir antes del pago.
                </p>
              </div>
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
                  matchTresVias.expedienteCompleto
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {matchTresVias.expedienteCompleto ? 'Expediente completo' : 'Pendiente de cierre'}
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              <ItemMatch ok label="Orden de compra emitida" detalle={orden.numero} />
              <ItemMatch
                ok={matchTresVias.tieneRecepcion}
                label="Recepción física en depósito"
                detalle={
                  matchTresVias.tieneRecepcion
                    ? `${recepciones.length} ingreso${recepciones.length === 1 ? '' : 's'} registrado${recepciones.length === 1 ? '' : 's'}`
                    : 'Aún no ingresó mercadería contra esta OC'
                }
              />
              <ItemMatch
                ok={matchTresVias.tieneRemitoAdjunto}
                label="Remito escaneado (depósito)"
                detalle={
                  matchTresVias.tieneRemitoAdjunto
                    ? 'PDF o foto disponible en documentos'
                    : 'Falta la foto del remito de papel'
                }
              />
              <ItemMatch
                ok={matchTresVias.tieneFacturaRegistrada}
                label="Factura registrada en tesorería"
                detalle={
                  matchTresVias.tieneFacturaRegistrada
                    ? `${facturas.filter((f) => f.estado !== 'ANULADA').length} factura(s) vinculada(s)`
                    : 'Registrar factura desde Compras o Tesorería'
                }
              />
              <ItemMatch
                ok={matchTresVias.tieneFacturaPdf}
                label="PDF de factura adjunto"
                detalle={
                  matchTresVias.tieneFacturaPdf
                    ? 'Comprobante fiscal disponible'
                    : 'Subir el PDF recibido por mail'
                }
              />
              <ItemMatch
                ok={matchTresVias.montosCoinciden}
                label="Montos conciliados"
                detalle={
                  matchTresVias.montosCoinciden
                    ? 'Total facturado coincide con la OC'
                    : `Saldo pendiente: ${formatMonedaCompra(resumenMatch?.saldoFacturar ?? 0, orden.moneda)}`
                }
              />
            </ul>
          </section>
        ) : null}

        {/* Tarjeta 2 — Líneas pedidas */}
        <section className={cardClass} aria-labelledby="oc-lineas">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-neutral-400" aria-hidden />
            <h2 id="oc-lineas" className="text-base font-semibold text-neutral-900">
              Líneas pedidas
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-2 py-2 font-semibold">Insumo</th>
                  <th className="px-2 py-2 font-semibold">Unidad</th>
                  <th className="px-2 py-2 text-right font-semibold">Solicitado</th>
                  <th className="px-2 py-2 text-right font-semibold">Recibido</th>
                  <th className="px-2 py-2 text-right font-semibold">Pendiente</th>
                  <th className="px-2 py-2 text-right font-semibold">P. unit.</th>
                  <th className="px-2 py-2 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {orden.items.map((it) => (
                  <tr key={it.lineaId} className="border-b border-neutral-50">
                    <td className="px-2 py-2.5 text-neutral-800">{it.nombreSnapshot}</td>
                    <td className="px-2 py-2.5 text-neutral-600">{it.unidadBase}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{it.cantidadSolicitada}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-blue-800">
                      {it.cantidadRecibida}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-amber-800">
                      {it.cantidadPendiente}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {formatMonedaCompra(it.precioUnitario, orden.moneda)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums font-medium">
                      {formatMonedaCompra(it.subtotalLinea, orden.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tarjeta 3 — Recepciones */}
        <section className={cardClass} aria-labelledby="oc-recepciones">
          <div className="mb-4 flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-neutral-400" aria-hidden />
            <h2 id="oc-recepciones" className="text-base font-semibold text-neutral-900">
              Recepciones en depósito
            </h2>
          </div>
          {recepciones.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Aún no hay ingresos vinculados a esta OC en movimientos de inventario.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-2 py-2 font-semibold">Documento</th>
                    <th className="px-2 py-2 font-semibold">Nº remito / factura</th>
                    <th className="px-2 py-2 font-semibold">Fecha ingreso</th>
                    <th className="px-2 py-2 font-semibold">Recepcionó</th>
                    <th className="px-2 py-2 text-right font-semibold">Líneas</th>
                    <th className="px-2 py-2 text-right font-semibold">Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {recepciones.map((r) => (
                    <tr key={r.movimientoId} className="border-b border-neutral-50">
                      <td className="px-2 py-2.5 text-neutral-700">{r.tipoDocumento}</td>
                      <td className="px-2 py-2.5 font-medium text-neutral-900">
                        {r.numeroDocumento || '—'}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-600">
                        {r.fecha ? r.fecha.toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-600">{r.usuarioRecepcionNombre}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.cantidadLineas}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.cantidadUnidades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Tarjeta 4 — Facturas */}
        <section className={cardClass} aria-labelledby="oc-facturas">
          <div className="mb-4 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-neutral-400" aria-hidden />
            <h2 id="oc-facturas" className="text-base font-semibold text-neutral-900">
              Facturas de proveedor
            </h2>
          </div>
          {facturas.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay facturas registradas contra esta OC en tesorería.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-2 py-2 font-semibold">Nº factura</th>
                    <th className="px-2 py-2 font-semibold">Estado</th>
                    <th className="px-2 py-2 font-semibold">Emisión</th>
                    <th className="px-2 py-2 font-semibold">Vencimiento</th>
                    <th className="px-2 py-2 text-right font-semibold">Total</th>
                    <th className="px-2 py-2 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => (
                    <tr key={f.id} className="border-b border-neutral-50">
                      <td className="px-2 py-2.5 font-medium text-neutral-900">
                        {f.numeroFactura}
                      </td>
                      <td className="px-2 py-2.5">
                        <EstadoBadge tipo="factura" estado={f.estado} />
                      </td>
                      <td className="px-2 py-2.5 text-neutral-600">
                        {formatFechaTesoreria(f.fechaEmision)}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-600">
                        {formatYmdTesoreria(f.fechaVencimiento)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {formatMonedaArs(f.total, f.moneda)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-medium">
                        {formatMonedaArs(f.saldoPendiente, f.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Tarjeta 5 — Documentos adjuntos */}
        <section className={cardClass} aria-labelledby="oc-documentos">
          <div className="mb-4 flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-neutral-400" aria-hidden />
            <h2 id="oc-documentos" className="text-base font-semibold text-neutral-900">
              Documentos adjuntos
            </h2>
          </div>
          <p className="mb-4 text-sm text-neutral-500">
            Los remitos que sube depósito y las facturas PDF aparecen acá y también en el{' '}
            <Link
              to={`/control/proveedores/${orden.proveedorId}`}
              className="font-semibold text-[#CD1818] hover:underline"
            >
              legajo del proveedor
            </Link>
            .
          </p>

          <DocumentosAdjuntosPanel
            entidadId={orden.id}
            entidadTipo="ORDEN_COMPRA"
            documentos={documentos}
            onDocumentosChange={setDocumentos}
            puedeSubir={puedeSubir}
            ordenCompraId={orden.id}
            proveedorId={orden.proveedorId}
          />
        </section>
      </div>
    </div>
  )
}
