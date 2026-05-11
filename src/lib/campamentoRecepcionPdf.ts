import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  ItemMovimientoInventario,
  MovimientoEgresoTraslado,
} from './movimientosInventario'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

function fmtVto(v: string | null | undefined): string {
  if (!v?.trim()) return '—'
  const t = v.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const [y, m, d] = t.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

/**
 * Hoja de control en papel: ítems con columna vacía para cantidad recibida a mano.
 */
export function exportarHojaControlRecepcionPdf(
  egreso: MovimientoEgresoTraslado,
  unidadPorInsumoId: Map<string, string>,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 12
  let y = 14

  doc.setFontSize(15)
  doc.setTextColor(205, 24, 24)
  doc.text('Hoja de control — Recepción de traslado', margin, y)

  y += 10
  doc.setFontSize(11)
  doc.setTextColor(23, 23, 23)
  const t = egreso.transporte
  doc.setFont('helvetica', 'bold')
  doc.text(`Nro Remito: ${egreso.numeroDocumento}`, margin, y)
  y += 6
  doc.text(`Chofer: ${t?.chofer?.trim() || '—'}`, margin, y)
  y += 6
  doc.text(`Patente: ${t?.patente?.trim() || '—'}`, margin, y)
  y += 6
  doc.text(`Nro de precinto: ${t?.precinto?.trim() || '—'}`, margin, y)
  doc.setFont('helvetica', 'normal')

  y += 4
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Destino (texto): ${egreso.destino} · ${egreso.items.length} ítems`,
    margin,
    y,
  )
  y += 8

  const body: string[][] = egreso.items.map((it: ItemMovimientoInventario) => {
    const unidad = unidadPorInsumoId.get(it.insumoId) ?? '—'
    const lote = it.lote?.trim() || '—'
    const vto = fmtVto(it.fechaVencimiento ?? null)
    return [it.nombreSnapshot, unidad, lote, vto, '']
  })

  autoTable(doc, {
    startY: y,
    head: [['Insumo', 'Unidad', 'Lote', 'Vencimiento', 'Cantidad Recibida']],
    body,
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 18 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 22 },
    },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
  })

  const slug = safeFilenamePart(egreso.numeroDocumento || egreso.id)
  const d = new Date()
  doc.save(
    `Hoja_control_recepcion_${slug}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`,
  )
}
