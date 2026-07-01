import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ExpedienteOcData, LegajoProveedorData, MatchTresViasEstado } from './comprasQueries'
import { etiquetaTipoComprobante, formatearTamanoArchivo } from './documentos'
import { formatMonedaCompra, formatYmdLegible } from './comprasUi'
import { montoFacturadoOc, saldoAFacturarOc } from './tesoreriaQueries'
import { formatFechaTimestamp, formatMonedaArs } from './tesoreriaUi'
import type { Timestamp } from 'firebase/firestore'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 60)
}

function tsToDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (v && typeof v === 'object' && 'toDate' in v) {
    return (v as Timestamp).toDate()
  }
  return null
}

function formatFechaDoc(v: unknown): string {
  const d = tsToDate(v)
  return d ? d.toLocaleString('es-AR') : '—'
}

function nombreArchivoExpedienteOc(numero: string): string {
  const now = new Date()
  return `Expediente_${safeFilenamePart(numero)}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`
}

function nombreArchivoLegajoProveedor(razonSocial: string): string {
  const now = new Date()
  return `Legajo_${safeFilenamePart(razonSocial)}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`
}

function encabezadoPdf(doc: jsPDF, titulo: string, subtitulo: string): number {
  const margin = 14
  let y = 16
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Cocina Industrial · Compras y pagos', margin, y)
  y += 6
  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.text(titulo, margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text(subtitulo, margin, y)
  y += 4
  doc.setDrawColor(205, 24, 24)
  doc.setLineWidth(0.4)
  doc.line(margin, y + 2, doc.internal.pageSize.getWidth() - margin, y + 2)
  return y + 10
}

function piePagina(doc: jsPDF, pagina: number, total: number): void {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(
    `Generado ${new Date().toLocaleString('es-AR')} · Página ${pagina} de ${total}`,
    14,
    h - 8,
  )
  doc.text('Documento informativo — los archivos originales están en el sistema digital.', w / 2, h - 8, {
    align: 'center',
  })
}

function agregarTabla(
  doc: jsPDF,
  startY: number,
  head: string[][],
  body: string[][],
  titulo?: string,
): number {
  const margin = 14
  let y = startY
  if (titulo) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 18
    }
    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.text(titulo, margin, y)
    y += 5
  }
  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [205, 24, 24], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  })
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
}

/** Exporta el expediente de una OC (resumen, match 3 vías, ítems, recepciones, facturas, adjuntos). */
export function exportarExpedienteOcPdf(
  data: ExpedienteOcData,
  match: MatchTresViasEstado | null,
): void {
  const { orden, recepciones, facturas, documentos } = data
  if (!orden) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = encabezadoPdf(
    doc,
    `Expediente ${orden.numero}`,
    `${orden.proveedorNombre} · ${orden.estado.replace(/_/g, ' ')}`,
  )

  const resumenBody: string[][] = [
    ['Proveedor', orden.proveedorNombre],
    ['CUIT', orden.proveedorCuit || '—'],
    ['Emisión', formatFechaDoc(orden.fechaEmision)],
    ['Entrega estimada', formatYmdLegible(orden.fechaEntregaEstimada)],
    ['Condición de pago', orden.condicionPago],
    ['Total OC', formatMonedaCompra(orden.total, orden.moneda)],
    ['Facturado', formatMonedaCompra(montoFacturadoOc(orden), orden.moneda)],
    ['Saldo a facturar', formatMonedaCompra(saldoAFacturarOc(orden), orden.moneda)],
  ]
  y = agregarTabla(doc, y, [['Campo', 'Valor']], resumenBody, 'Resumen de la orden de compra')

  if (match) {
    const matchBody: string[][] = [
      ['OC emitida', 'Sí'],
      ['Recepción en depósito', match.tieneRecepcion ? 'Sí' : 'No'],
      ['Remito adjunto', match.tieneRemitoAdjunto ? 'Sí' : 'No'],
      ['Factura registrada', match.tieneFacturaRegistrada ? 'Sí' : 'No'],
      ['PDF factura', match.tieneFacturaPdf ? 'Sí' : 'No'],
      ['Montos conciliados', match.montosCoinciden ? 'Sí' : 'No'],
      ['Estado expediente', match.expedienteCompleto ? 'COMPLETO' : 'PENDIENTE'],
    ]
    y = agregarTabla(doc, y, [['Control', 'Estado']], matchBody, 'Match de 3 vías')
  }

  const lineasBody = orden.items
    .filter((it) => it.estadoLinea !== 'CANCELADA')
    .map((it) => [
      it.nombreSnapshot,
      it.unidadBase,
      String(it.cantidadSolicitada),
      String(it.cantidadRecibida),
      String(it.cantidadPendiente),
      formatMonedaCompra(it.precioUnitario, orden.moneda),
      formatMonedaCompra(it.subtotalLinea, orden.moneda),
    ])
  if (lineasBody.length > 0) {
    y = agregarTabla(
      doc,
      y,
      [['Insumo', 'Ud.', 'Solic.', 'Recib.', 'Pend.', 'P.unit.', 'Subtotal']],
      lineasBody,
      'Líneas de la OC',
    )
  }

  if (recepciones.length > 0) {
    const recepBody = recepciones.map((r) => [
      r.tipoDocumento,
      r.numeroDocumento,
      r.fecha ? r.fecha.toLocaleDateString('es-AR') : '—',
      String(r.cantidadLineas),
      String(r.cantidadUnidades),
      r.usuarioRecepcionNombre,
    ])
    y = agregarTabla(
      doc,
      y,
      [['Tipo', 'Nº doc.', 'Fecha', 'Líneas', 'Unidades', 'Usuario']],
      recepBody,
      'Recepciones en depósito',
    )
  }

  const facturasActivas = facturas.filter((f) => f.estado !== 'ANULADA')
  if (facturasActivas.length > 0) {
    const facBody = facturasActivas.map((f) => [
      f.numeroFactura,
      f.estado.replace(/_/g, ' '),
      formatYmdLegible(f.fechaVencimiento),
      formatMonedaArs(f.total, f.moneda),
      formatMonedaArs(f.saldoPendiente, f.moneda),
    ])
    y = agregarTabla(
      doc,
      y,
      [['Nº factura', 'Estado', 'Vencimiento', 'Total', 'Saldo']],
      facBody,
      'Facturas de proveedor',
    )
  }

  if (documentos.length > 0) {
    const docsBody = documentos.map((d) => [
      etiquetaTipoComprobante(d.tipoComprobante),
      d.nombreArchivo,
      formatFechaDoc(d.fechaSubida),
      formatearTamanoArchivo(d.tamanoBytes),
      d.url.length > 80 ? `${d.url.slice(0, 77)}…` : d.url,
    ])
    agregarTabla(
      doc,
      y,
      [['Tipo', 'Archivo', 'Subido', 'Tamaño', 'Enlace']],
      docsBody,
      'Documentos adjuntos (referencia)',
    )
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    piePagina(doc, i, totalPages)
  }

  doc.save(nombreArchivoExpedienteOc(orden.numero))
}

/** Exporta el legajo completo del proveedor (datos, OC, facturas, OP, archivos). */
export function exportarLegajoProveedorPdf(data: LegajoProveedorData): void {
  const { proveedor, ordenes, facturas, ordenesPago, documentos } = data
  if (!proveedor) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = encabezadoPdf(
    doc,
    `Legajo · ${proveedor.razonSocial}`,
    `CUIT ${proveedor.cuit || '—'} · ${proveedor.proveedorActivo ? 'Activo' : 'Inactivo'}`,
  )

  const datosBody: string[][] = [
    ['Razón social', proveedor.razonSocial],
    ['CUIT', proveedor.cuit || '—'],
    ['Dirección fiscal', proveedor.direccionFiscal || '—'],
    ['Localidad', `${proveedor.localidad || '—'}, ${proveedor.provincia || ''}`.trim()],
    ['Email / Tel.', [proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || '—'],
    ['Plazo de pago', `${proveedor.plazoPagoDias} días`],
    ['Moneda', proveedor.monedaDefault],
  ]
  y = agregarTabla(doc, y, [['Campo', 'Valor']], datosBody, 'Datos del proveedor')

  if (ordenes.length > 0) {
    const ocBody = ordenes.map((oc) => [
      oc.numero,
      oc.estado.replace(/_/g, ' '),
      formatYmdLegible(oc.fechaEntregaEstimada),
      formatMonedaCompra(oc.total, oc.moneda),
    ])
    y = agregarTabla(
      doc,
      y,
      [['Nº OC', 'Estado', 'Entrega', 'Total']],
      ocBody,
      `Órdenes de compra (${ordenes.length})`,
    )
  }

  const facturasActivas = facturas.filter((f) => f.estado !== 'ANULADA')
  if (facturasActivas.length > 0) {
    const facBody = facturasActivas.map((f) => [
      f.numeroFactura,
      f.ordenCompraNumero,
      f.estado.replace(/_/g, ' '),
      formatYmdLegible(f.fechaVencimiento),
      formatMonedaArs(f.total, f.moneda),
      formatMonedaArs(f.saldoPendiente, f.moneda),
    ])
    y = agregarTabla(
      doc,
      y,
      [['Factura', 'OC', 'Estado', 'Venc.', 'Total', 'Saldo']],
      facBody,
      `Facturas (${facturasActivas.length})`,
    )
  }

  const opsActivas = ordenesPago.filter((op) => op.estado !== 'ANULADA')
  if (opsActivas.length > 0) {
    const opBody = opsActivas.map((op) => [
      op.numero,
      formatFechaTimestamp(op.fechaPago),
      op.metodoPago,
      op.referenciaPago,
      formatMonedaArs(op.montoTotal),
      op.estado,
    ])
    y = agregarTabla(
      doc,
      y,
      [['Nº OP', 'Fecha', 'Método', 'Referencia', 'Monto', 'Estado']],
      opBody,
      `Órdenes de pago (${opsActivas.length})`,
    )
  }

  if (documentos.length > 0) {
    const docsBody = documentos.map((d) => [
      etiquetaTipoComprobante(d.tipoComprobante),
      d.nombreArchivo,
      d.ordenCompraId ? 'OC' : d.entidadTipo === 'ORDEN_PAGO' ? 'OP' : 'Proveedor',
      formatFechaDoc(d.fechaSubida),
      d.url.length > 70 ? `${d.url.slice(0, 67)}…` : d.url,
    ])
    agregarTabla(
      doc,
      y,
      [['Tipo', 'Archivo', 'Origen', 'Subido', 'Enlace']],
      docsBody,
      `Archivos del legajo (${documentos.length})`,
    )
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    piePagina(doc, i, totalPages)
  }

  doc.save(nombreArchivoLegajoProveedor(proveedor.razonSocial))
}
