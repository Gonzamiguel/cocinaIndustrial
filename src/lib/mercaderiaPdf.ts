import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SolicitudMercaderia } from './solicitudesMercaderia'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

function formatFechaCreacionPdf(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * PDF con resumen completo de la solicitud (archivo / cocina / campamento).
 */
export function exportarSolicitudMercaderiaResumenPdf(s: SolicitudMercaderia): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth()
  const maxTextW = pageW - margin * 2
  let y = 18

  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.text('Solicitud de mercadería', margin, y)

  y += 10
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`ID: ${s.id}`, margin, y)
  y += 5
  doc.text(`Creación: ${formatFechaCreacionPdf(s.fechaCreacion)}`, margin, y)
  y += 5
  doc.text(`Entrega esperada: ${s.fechaEntregaEsperada || '—'}`, margin, y)
  y += 5
  doc.text(`Prioridad: ${s.prioridad} · Estado: ${s.estado}`, margin, y)
  y += 5
  if (s.ubicacionSolicitanteId?.trim()) {
    doc.text(`Ubicación solicitante: ${s.ubicacionSolicitanteId.trim()}`, margin, y)
    y += 5
  }

  y += 3
  doc.setTextColor(23, 23, 23)

  const escribirBloque = (titulo: string, cuerpo: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(titulo, margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(cuerpo.trim(), maxTextW)
    doc.text(lines, margin, y)
    y += Math.max(lines.length, 1) * 4.2 + 4
  }

  if (s.observacionesDeposito?.trim()) {
    escribirBloque('Observaciones del depósito', s.observacionesDeposito)
  }
  if (s.observacionesRecepcion?.trim()) {
    escribirBloque('Observaciones de recepción (cocina)', s.observacionesRecepcion)
  }

  y += 2
  const body = s.items.map((it) => [
    it.producto,
    String(it.cantidad),
    it.unidadMedida,
    it.presentacion,
    it.observacion || '—',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cantidad', 'Unidad', 'Presentación', 'Observación']],
    body,
    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  const slug = safeFilenamePart(s.id)
  const d = new Date()
  doc.save(
    `Solicitud_mercaderia_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
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
    it.observacion || '—',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cantidad', 'Unidad', 'Presentación', 'Observación']],
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
