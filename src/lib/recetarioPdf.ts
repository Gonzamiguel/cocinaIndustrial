import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RecetaTecnica } from './recetario'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 48)
}

const MARGIN = 14
const PAGE_H = 297
const FOOTER_Y = PAGE_H - 10

function asegurarEspacio(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= FOOTER_Y) return y
  doc.addPage()
  return MARGIN + 8
}

function escribirRecetaEnPdf(doc: jsPDF, receta: RecetaTecnica, yInicio: number): number {
  const pageW = doc.internal.pageSize.getWidth()
  const maxTextW = pageW - MARGIN * 2
  let y = yInicio

  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.setFont('helvetica', 'bold')
  const tituloLines = doc.splitTextToSize(receta.nombre, maxTextW)
  y = asegurarEspacio(doc, y, tituloLines.length * 7 + 20)
  doc.text(tituloLines, MARGIN, y)
  y += tituloLines.length * 7 + 2

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'normal')
  y = asegurarEspacio(doc, y, 18)
  doc.text(`Categoría: ${receta.categoria}`, MARGIN, y)
  y += 5
  doc.text(`Rendimiento: ${receta.rendimientoPorciones} porciones`, MARGIN, y)
  y += 5

  if (receta.dietas.length > 0) {
    doc.text(`Dietas: ${receta.dietas.join(' · ')}`, MARGIN, y)
    y += 5
  }

  if (receta.categoria === 'Principal') {
    doc.text(
      `Acepta guarnición: ${receta.aceptaGuarnicion ? 'Sí' : 'No'}`,
      MARGIN,
      y,
    )
    y += 5
  }

  y += 4
  doc.setTextColor(23, 23, 23)

  const bodyIngredientes = receta.ingredientes.map((ing) => [
    ing.ingrediente,
    String(ing.cantidadBruta),
    ing.unidad,
  ])

  autoTable(doc, {
    startY: y,
    head: [['Ingrediente', 'Cantidad', 'Unidad']],
    body:
      bodyIngredientes.length > 0
        ? bodyIngredientes
        : [['—', '—', '—']],
    styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: MARGIN, right: MARGIN },
  })

  y =
    (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
    y + 10
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(205, 24, 24)
  y = asegurarEspacio(doc, y, 12)
  doc.text('Elaboración', MARGIN, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(23, 23, 23)
  const procedimiento =
    receta.procedimiento.trim() || 'Sin procedimiento cargado.'
  const procLines = doc.splitTextToSize(procedimiento, maxTextW)

  for (const line of procLines) {
    y = asegurarEspacio(doc, y, 5)
    doc.text(line, MARGIN, y)
    y += 4.5
  }

  return y + 6
}

/** Ficha técnica operativa — sin costos. */
export function exportarRecetaTecnicaPdf(receta: RecetaTecnica): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  escribirRecetaEnPdf(doc, receta, 18)

  const slug = safeFilenamePart(receta.nombre)
  const d = new Date()
  doc.save(
    `Ficha_tecnica_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}

/** Varias fichas en un solo PDF (planificación de menú). */
export function exportarRecetarioLotePdf(
  recetas: RecetaTecnica[],
  opciones?: { tituloPortada?: string },
): void {
  if (recetas.length === 0) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const titulo = opciones?.tituloPortada ?? 'Planificación de menú — Fichas técnicas'

  doc.setFontSize(14)
  doc.setTextColor(205, 24, 24)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, MARGIN, 18)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`${recetas.length} receta${recetas.length === 1 ? '' : 's'}`, MARGIN, 26)

  let y = 34
  for (let i = 0; i < recetas.length; i += 1) {
    if (i > 0) {
      doc.addPage()
      y = MARGIN + 8
    }
    y = escribirRecetaEnPdf(doc, recetas[i], y)
  }

  const d = new Date()
  doc.save(
    `Fichas_tecnicas_menu_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}
