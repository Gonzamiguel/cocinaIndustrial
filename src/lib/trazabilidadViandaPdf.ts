import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ProduccionCocinaRegistro } from './movimientosInventario'
import {
  ETIQUETA_TIPO_PASO,
  formatFechaHoraTrazabilidadVianda,
  type PasoTrazabilidadVianda,
} from './trazabilidadVianda'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

export function exportarTrazabilidadViandaPdf(
  produccion: ProduccionCocinaRegistro,
  timeline: PasoTrazabilidadVianda[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  const pageH = doc.internal.pageSize.getHeight()
  let y = 16

  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.text('Trazabilidad HACCP — Viandas', margin, y)

  y += 9
  doc.setFontSize(10)
  doc.setTextColor(23, 23, 23)
  doc.setFont('helvetica', 'bold')
  doc.text(produccion.nombreProducto, margin, y)
  doc.setFont('helvetica', 'normal')

  y += 6
  doc.setFontSize(9)
  doc.setTextColor(80, 90, 100)
  doc.text(`Lote vianda: ${produccion.loteProducto}`, margin, y)
  y += 4.5
  doc.text(
    `${produccion.cantidadPorciones} viandas · Receta ${produccion.recetaNombre} · Vto ${produccion.fechaVencimiento}`,
    margin,
    y,
  )
  y += 4.5
  if (produccion.codigoTrazabilidad?.trim()) {
    doc.text(`Código trazabilidad: ${produccion.codigoTrazabilidad.trim()}`, margin, y)
    y += 4.5
  }
  doc.text(`Producido: ${formatFechaHoraTrazabilidadVianda(produccion.fecha)}`, margin, y)
  y += 4.5
  doc.text(`ID producción: ${produccion.id}`, margin, y)
  y += 6

  doc.setFontSize(8)
  doc.setTextColor(120, 130, 140)
  doc.text(
    'Línea de tiempo ordenada cronológicamente (más antiguo → más reciente). Pasos sin fecha al final.',
    margin,
    y,
  )
  y += 5

  const body = timeline.map((paso, idx) => [
    String(idx + 1),
    formatFechaHoraTrazabilidadVianda(paso.fecha),
    ETIQUETA_TIPO_PASO[paso.tipo],
    paso.titulo,
    paso.detalle,
    [paso.insumoNombre, paso.loteInsumo ? `Lote ${paso.loteInsumo}` : null, paso.cantidadTexto]
      .filter(Boolean)
      .join(' · ') || '—',
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'Fecha', 'Etapa', 'Evento', 'Detalle', 'Insumo / lote']],
    body,
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 22 },
      3: { cellWidth: 38 },
      4: { cellWidth: 52 },
      5: { cellWidth: 32 },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      const pagina = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(150, 160, 170)
      doc.text(
        `Generado ${new Date().toLocaleString('es-AR')} · Pág. ${data.pageNumber}/${pagina}`,
        margin,
        pageH - 8,
      )
    },
  })

  const slug = safeFilenamePart(produccion.loteProducto || produccion.id)
  const now = new Date()
  doc.save(
    `Trazabilidad_${slug}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`,
  )
}
