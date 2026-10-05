import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RecetaTecnica } from './recetario'
import {
  consolidarIngredientesPlanificados,
  type ItemExplosionPlanificada,
  type LineaPlanProduccion,
} from './requisicionPlanificada'
import type { Insumo } from './insumos'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

export function exportarPdfInsumosPlanProduccion(input: {
  semanaInicioYmd: string
  semanaFinYmd: string
  lineas: LineaPlanProduccion[]
  recetasById: Map<string, RecetaTecnica>
  insumosById: Map<string, Insumo>
}): void {
  const explosion = consolidarIngredientesPlanificados(
    input.lineas,
    input.recetasById,
    input.insumosById,
  )
  if (explosion.length === 0) {
    throw new Error('No hay insumos para exportar. Cargá recetas y porciones.')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  let y = 16

  doc.setFontSize(16)
  doc.setTextColor(205, 24, 24)
  doc.text('Plan de producción — Insumos', margin, y)
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(80, 90, 100)
  doc.text(`Semana ${input.semanaInicioYmd} → ${input.semanaFinYmd}`, margin, y)
  y += 8

  const bodyPlatos: string[][] = input.lineas
    .filter((l) => l.porciones > 0 && l.recetaId)
    .map((l) => {
      const r = input.recetasById.get(l.recetaId)
      return [
        l.fechaYmd,
        r?.codigoCorto || '—',
        r?.nombre || l.recetaId,
        String(l.porciones),
      ]
    })

  autoTable(doc, {
    startY: y,
    head: [['Día', 'Cód.', 'Elaboración', 'Porciones']],
    body: bodyPlatos,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [205, 24, 24], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  })

  y =
    (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
    y + 20
  y += 8
  doc.setFontSize(11)
  doc.setTextColor(205, 24, 24)
  doc.text('Insumos consolidados (merma y rendimiento)', margin, y)

  const bodyInsumos: string[][] = explosion.map((f: ItemExplosionPlanificada) => [
    f.producto,
    f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 4 }),
    f.unidadMedida,
    f.origen.slice(0, 3).join(' · '),
  ])

  autoTable(doc, {
    startY: y + 3,
    head: [['Insumo', 'Cantidad', 'Unidad', 'Origen']],
    body: bodyInsumos,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [23, 23, 23], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 24, halign: 'right' },
      2: { cellWidth: 18 },
      3: { cellWidth: 82 },
    },
    margin: { left: margin, right: margin },
  })

  const d = new Date()
  doc.save(
    `Plan_insumos_${safeFilenamePart(input.semanaInicioYmd)}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}
