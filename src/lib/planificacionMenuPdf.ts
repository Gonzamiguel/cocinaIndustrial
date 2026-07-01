import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PlanificacionMenuEmpresa } from '../types/planificacionMenuEmpresa'
import { etiquetaSemanaPlanificacion, urlFormularioPedido } from './planificacionMenuEmpresa'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 50)
}

export function nombreArchivoPlanificacionMenu(empresaNombre: string, semanaInicioYmd: string): string {
  const now = new Date()
  return `Planificacion_${safeFilenamePart(empresaNombre)}_${semanaInicioYmd}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}.pdf`
}

export function exportarPlanificacionMenuPdf(plan: PlanificacionMenuEmpresa): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  let y = 16

  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Cocina Industrial · Planificación de menú', margin, y)
  y += 6
  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.text(plan.empresaNombre, margin, y)
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text(
    `Semana ${etiquetaSemanaPlanificacion(plan.semanaInicioYmd, plan.semanaFinYmd)}`,
    margin,
    y,
  )
  y += 5
  if (plan.mensajeEmpresa?.trim()) {
    const lines = doc.splitTextToSize(plan.mensajeEmpresa.trim(), doc.internal.pageSize.getWidth() - margin * 2)
    doc.text(lines, margin, y)
    y += lines.length * 4 + 2
  }
  if (plan.tokenPublico) {
    doc.setTextColor(100, 100, 100)
    doc.text(`Formulario online: ${urlFormularioPedido(plan.tokenPublico)}`, margin, y)
    y += 6
  }

  autoTable(doc, {
    startY: y + 2,
    head: [['Día', 'Plato principal', 'Guarnición', 'Observaciones']],
    body: plan.dias.map((d) => [
      d.fechaConsumo,
      d.opcionesPrincipales.map((o) => o.nombre).join(' · ') || '—',
      d.opcionesGuarniciones.map((o) => o.nombre).join(' · ') || '—',
      d.observaciones?.trim() || '—',
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [205, 24, 24], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: margin, right: margin },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(
    `Generado ${new Date().toLocaleString('es-AR')} · Estado: ${plan.estado}`,
    margin,
    finalY + 10,
  )

  doc.save(nombreArchivoPlanificacionMenu(plan.empresaNombre, plan.semanaInicioYmd))
}
