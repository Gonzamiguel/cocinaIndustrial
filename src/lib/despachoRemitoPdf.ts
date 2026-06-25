import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DespachoViandaRegistro } from './despachosViandas'
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

/**
 * Remito imprimible con detalle de viandas, lotes y vencimientos + espacio para firmas.
 */
export function exportarRemitoDespachoPdf(remito: DespachoViandaRegistro): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth()
  let y = 16

  doc.setFontSize(17)
  doc.setTextColor(205, 24, 24)
  doc.text('Remito de despacho — Viandas', margin, y)

  y += 9
  doc.setFontSize(10)
  doc.setTextColor(23, 23, 23)
  doc.setFont('helvetica', 'bold')
  doc.text(`Nº ${remito.numeroRemito || remito.id}`, margin, y)
  doc.setFont('helvetica', 'normal')

  y += 7
  doc.setFontSize(9)
  doc.setTextColor(80, 90, 100)
  doc.text(`Empresa: ${remito.empresa}`, margin, y)
  y += 5
  doc.text(`Fecha despacho: ${formatFechaDespacho(remito.fecha)}`, margin, y)
  y += 5
  if (remito.lugarEntrega) {
    doc.text(`Lugar de entrega: ${remito.lugarEntrega}`, margin, y)
    y += 5
  }

  y += 3
  const body: string[][] = []
  for (const it of remito.items) {
    for (let i = 0; i < it.lotes.length; i++) {
      const l = it.lotes[i]
      body.push([
        i === 0 ? it.nombrePlato : '',
        i === 0 ? String(it.cantidadTotal) : '',
        l.lote || '—',
        formatFechaVencimiento(l.fechaVencimiento),
        String(l.cantidad),
        l.codigoTrazabilidad ? l.codigoTrazabilidad.slice(0, 28) : '—',
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Vianda', 'Total', 'Lote producción', 'Vencimiento', 'Cant.', 'Cód. trazabilidad']],
    body,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 38 },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  let yAfter =
    (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 40

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
  doc.text('Recibe conforme (empresa)', margin + firmaW + 10, yAfter + 23)

  const slug = safeFilenamePart(remito.numeroRemito || remito.id)
  const d = new Date()
  doc.save(
    `Remito_despacho_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}
