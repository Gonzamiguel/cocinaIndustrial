import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DespachoViandaRegistro } from './despachosViandas'
import { labelTipoDespacho } from './despachosViandas'
import { codigoLoteViandaParaRemito } from './produccionLotes'
import { formatFechaVencimiento } from './vencimientoLote'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 36)
}

function formatFechaDespacho(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function encabezadoRemito(
  doc: jsPDF,
  remito: DespachoViandaRegistro,
  titulo: string,
): { y: number; margin: number; pageW: number } {
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth()
  let y = 16

  doc.setFontSize(17)
  doc.setTextColor(205, 24, 24)
  doc.text(titulo, margin, y)

  y += 9
  doc.setFontSize(10)
  doc.setTextColor(23, 23, 23)
  doc.setFont('helvetica', 'bold')
  doc.text(`Nº ${remito.numeroRemito || remito.id}`, margin, y)
  doc.setFont('helvetica', 'normal')

  y += 7
  doc.setFontSize(9)
  doc.setTextColor(80, 90, 100)
  doc.text(`Tipo: ${labelTipoDespacho(remito.tipoDespacho)}`, margin, y)
  y += 5
  doc.text(`Destinatario: ${remito.destinatario || remito.empresa}`, margin, y)
  y += 5
  doc.text(`Fecha despacho: ${formatFechaDespacho(remito.fecha)}`, margin, y)
  y += 5
  if (remito.lugarEntrega) {
    doc.text(`Lugar de entrega: ${remito.lugarEntrega}`, margin, y)
    y += 5
  }

  return { y: y + 3, margin, pageW }
}

function pieFirmasYObservaciones(
  doc: jsPDF,
  remito: DespachoViandaRegistro,
  yStart: number,
  margin: number,
  pageW: number,
  etiquetaRecibe: string,
): void {
  let yAfter = yStart

  if (remito.observaciones.trim()) {
    yAfter += 8
    doc.setFontSize(9)
    doc.setTextColor(23, 23, 23)
    doc.setFont('helvetica', 'bold')
    doc.text('Observaciones', margin, yAfter)
    yAfter += 5
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(remito.observaciones.trim(), pageW - margin * 2)
    doc.text(lines, margin, yAfter)
    yAfter += lines.length * 4.5 + 4
  }

  yAfter += 12
  const firmaW = (pageW - margin * 2 - 10) / 2
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, yAfter + 18, margin + firmaW, yAfter + 18)
  doc.line(margin + firmaW + 10, yAfter + 18, pageW - margin, yAfter + 18)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Entrega (cocina / logística)', margin, yAfter + 23)
  doc.text(etiquetaRecibe, margin + firmaW + 10, yAfter + 23)
}

function guardarPdf(doc: jsPDF, remito: DespachoViandaRegistro, sufijo: string): void {
  const slug = safeFilenamePart(remito.numeroRemito || remito.id)
  const d = new Date()
  doc.save(
    `Remito_${sufijo}_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}

function lastTableY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
}

/** Remito formal para el cliente: menús y cantidades, sin códigos de lote. */
export function exportarRemitoFormalClientePdf(remito: DespachoViandaRegistro): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const { y, margin, pageW } = encabezadoRemito(
    doc,
    remito,
    'Remito de despacho — Viandas',
  )

  const body = remito.items.map((it) => [it.nombrePlato, String(it.cantidadTotal)])

  autoTable(doc, {
    startY: y,
    head: [['Menú / vianda', 'Cantidad entregada']],
    body,
    styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 140 },
      1: { cellWidth: 32, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  pieFirmasYObservaciones(
    doc,
    remito,
    lastTableY(doc, y + 40),
    margin,
    pageW,
    'Recibe conforme (empresa)',
  )
  guardarPdf(doc, remito, 'formal')
}

/** Remito operativo interno: códigos de lote V- exactos que subieron al transporte. */
export function exportarRemitoOperativoInternoPdf(remito: DespachoViandaRegistro): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const { y, margin, pageW } = encabezadoRemito(
    doc,
    remito,
    'Remito operativo interno — Lotes V-',
  )

  const body: string[][] = []
  for (const it of remito.items) {
    for (let i = 0; i < it.lotes.length; i++) {
      const l = it.lotes[i]
      const codigoV = codigoLoteViandaParaRemito({
        lote: l.lote,
        codigoTrazabilidad: l.codigoTrazabilidad,
      })
      body.push([
        i === 0 ? it.nombrePlato : '',
        i === 0 ? String(it.cantidadTotal) : '',
        codigoV,
        formatFechaVencimiento(l.fechaVencimiento),
        String(l.cantidad),
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Vianda', 'Total', 'Lote V- (transporte)', 'Vencimiento', 'Cant.']],
    body,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', font: 'courier' },
    headStyles: {
      fillColor: [23, 23, 23],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      font: 'helvetica',
    },
    columnStyles: {
      0: { cellWidth: 42, font: 'helvetica' },
      1: { cellWidth: 16, halign: 'center', font: 'helvetica' },
      2: { cellWidth: 70, font: 'courier', fontSize: 7 },
      3: { cellWidth: 28, font: 'helvetica' },
      4: { cellWidth: 16, halign: 'right', font: 'helvetica' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  pieFirmasYObservaciones(
    doc,
    remito,
    lastTableY(doc, y + 40),
    margin,
    pageW,
    'Control interno / auditoría',
  )
  guardarPdf(doc, remito, 'operativo_V')
}

/** @deprecated Preferir exportarRemitoFormalClientePdf. Alias de compatibilidad. */
export function exportarRemitoDespachoPdf(remito: DespachoViandaRegistro): void {
  exportarRemitoFormalClientePdf(remito)
}
