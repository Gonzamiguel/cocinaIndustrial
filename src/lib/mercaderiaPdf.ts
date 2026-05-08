import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SolicitudMercaderia } from './solicitudesMercaderia'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

/**
 * PDF para picking físico en depósito (impresión operativa).
 */
export function exportarSolicitudMercaderiaPdf(s: SolicitudMercaderia): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  let y = 18

  doc.setFontSize(16)
  doc.setTextColor(0, 51, 102)
  doc.text('Orden de Preparación - Depósito', margin, y)

  y += 10
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text(`Fecha de entrega: ${s.fechaEntregaEsperada || '—'}`, margin, y)

  y += 6
  doc.text(`Prioridad: ${s.prioridad}`, margin, y)

  y += 10

  const body = s.items.map((it) => [
    it.producto,
    String(it.cantidad),
    it.unidadMedida,
    it.presentacion,
  ])

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cantidad', 'Unidad', 'Presentación']],
    body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  const slug = safeFilenamePart(s.id)
  const d = new Date()
  const nombreArchivo = `Orden_preparacion_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`
  doc.save(nombreArchivo)
}
