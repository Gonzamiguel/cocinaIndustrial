import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { MovimientoInventario } from './movimientosInventario'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 50)
}

function formatFechaHora(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFecha(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('es-AR')
}

function formatVto(value: string | null | undefined): string {
  if (!value?.trim()) return '—'
  const clean = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-AR')
  }
  return clean
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function docResumen(mov: MovimientoInventario): string {
  switch (mov.tipo) {
    case 'INGRESO':
      return `${mov.tipoDocumento} ${mov.numeroDocumento}`.trim()
    case 'EGRESO':
      return mov.numeroDocumento || '—'
    default:
      return '—'
  }
}

function detalleResumen(mov: MovimientoInventario): string {
  switch (mov.tipo) {
    case 'INGRESO':
      return mov.proveedor || '—'
    case 'EGRESO':
      return mov.destino || '—'
    case 'AJUSTE':
    case 'DECOMISO':
      return mov.motivo || '—'
    default:
      return '—'
  }
}

export type TipoVersionPdfMovimiento = 'CHOFER' | 'ADMINISTRATIVO'
export type TipoRemitoTransportePdf = TipoVersionPdfMovimiento

function tituloMovimientoPdf(
  mov: MovimientoInventario,
  tipo: TipoVersionPdfMovimiento,
): string {
  switch (mov.tipo) {
    case 'INGRESO':
      return tipo === 'CHOFER' ? 'Recibo de Carga' : 'Recibo Valorizado'
    case 'EGRESO':
      return tipo === 'CHOFER'
        ? 'REMITO DE CARGA / TRANSPORTE'
        : 'REMITO VALORIZADO - USO INTERNO'
    case 'AJUSTE':
      return tipo === 'CHOFER'
        ? 'Comprobante Operativo de Ajuste'
        : 'Comprobante Administrativo de Ajuste'
    case 'DECOMISO':
      return tipo === 'CHOFER'
        ? 'Comprobante Operativo de Decomiso'
        : 'Comprobante Administrativo de Decomiso'
    default:
      return 'Comprobante de Movimiento'
  }
}

function slugMovimiento(mov: MovimientoInventario): string {
  switch (mov.tipo) {
    case 'INGRESO':
      return safeFilenamePart(mov.numeroDocumento || mov.id)
    case 'EGRESO':
      return safeFilenamePart(mov.numeroDocumento || mov.id)
    case 'AJUSTE':
    case 'DECOMISO':
      return safeFilenamePart(mov.id)
  }
}

export function exportarMovimientoInventarioPdf(
  movimiento: MovimientoInventario,
  unidadesPorInsumoId: Map<string, string>,
  tipo: TipoVersionPdfMovimiento = 'ADMINISTRATIVO',
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  let y = 18
  const includeFinanzas = tipo === 'ADMINISTRATIVO'
  const totalGeneral = movimiento.items.reduce((acc, item) => {
    const precio =
      item.costoPorUnidadBaseSnapshot ?? item.precioUnitarioFacturado ?? null
    if (precio == null || !Number.isFinite(precio)) return acc
    return acc + Number(item.cantidad) * precio
  }, 0)

  doc.setFillColor(205, 24, 24)
  doc.roundedRect(margin, y - 8, 182, 16, 3, 3, 'F')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text(tituloMovimientoPdf(movimiento, tipo), margin + 4, y + 2)

  y += 18
  doc.setTextColor(23, 23, 23)
  doc.setFontSize(10)
  doc.text(`Fecha: ${formatFechaHora(movimiento.fecha)}`, margin, y)
  doc.text(`Tipo: ${movimiento.tipo}`, 130, y)

  y += 8
  doc.setDrawColor(229, 231, 235)
  doc.roundedRect(margin, y, 182, 36, 3, 3)
  doc.setTextColor(205, 24, 24)
  doc.setFontSize(11)
  doc.text('Datos del movimiento', margin + 3, y + 6)
  doc.setTextColor(23, 23, 23)
  doc.setFontSize(10)

  if (movimiento.tipo === 'INGRESO') {
    doc.text(`Proveedor: ${movimiento.proveedor || '—'}`, margin + 3, y + 13)
    doc.text(
      `Documento: ${`${movimiento.tipoDocumento} ${movimiento.numeroDocumento}`.trim() || '—'}`,
      margin + 3,
      y + 20,
    )
  } else if (movimiento.tipo === 'EGRESO') {
    doc.text(`Destino: ${movimiento.destino || '—'}`, margin + 3, y + 13)
    doc.text(`Documento: ${movimiento.numeroDocumento || '—'}`, margin + 3, y + 20)
  } else {
    doc.text(`Motivo: ${movimiento.motivo || '—'}`, margin + 3, y + 13)
  }

  doc.text(
    `Cantidad de ítems: ${movimiento.items.length.toLocaleString('es-AR')}`,
    margin + 3,
    y + 28,
  )

  let startTableY = y + 44

  if (movimiento.tipo === 'EGRESO' && movimiento.transporte) {
    doc.roundedRect(margin, startTableY, 182, 26, 3, 3)
    doc.setTextColor(205, 24, 24)
    doc.setFontSize(11)
    doc.text('Datos del transporte', margin + 3, startTableY + 6)
    doc.setTextColor(23, 23, 23)
    doc.setFontSize(10)
    doc.text(`Chofer: ${movimiento.transporte.chofer || '—'}`, margin + 3, startTableY + 13)
    doc.text(`Patente: ${movimiento.transporte.patente || '—'}`, margin + 64, startTableY + 13)
    doc.text(`Precinto: ${movimiento.transporte.precinto || '—'}`, margin + 125, startTableY + 13)
    startTableY += 34
  }

  const head = [
    [
      'Insumo',
      'Cantidad',
      'Unidad',
      'Lote',
      'Vencimiento',
      'Temp.',
      'Calidad',
      ...(includeFinanzas ? ['Precio u.', 'Subtotal'] : []),
    ],
  ]

  const body = movimiento.items.map((item) => [
    item.nombreSnapshot,
    Number(item.cantidad).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }),
    unidadesPorInsumoId.get(item.insumoId) || '—',
    item.lote?.trim() || '—',
    formatVto(item.fechaVencimiento),
    item.temperatura?.trim() || '—',
    item.controlCalidadOk ? 'OK' : '—',
    ...(includeFinanzas
      ? [
          formatMoney(
            item.costoPorUnidadBaseSnapshot ?? item.precioUnitarioFacturado,
          ),
          formatMoney(
            (item.costoPorUnidadBaseSnapshot ?? item.precioUnitarioFacturado) != null
              ? Number(item.cantidad) *
                  Number(
                    item.costoPorUnidadBaseSnapshot ??
                      item.precioUnitarioFacturado,
                  )
              : null,
          ),
        ]
      : []),
  ])

  autoTable(doc, {
    startY: startTableY,
    head,
    body,
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [23, 23, 23],
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
    columnStyles: includeFinanzas
      ? {
          0: { cellWidth: 40 },
          1: { cellWidth: 16, halign: 'right' },
          2: { cellWidth: 13, halign: 'center' },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 13, halign: 'center' },
          6: { cellWidth: 13, halign: 'center' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 23, halign: 'right' },
        }
      : undefined,
  })

  if (includeFinanzas) {
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? startTableY
    doc.setDrawColor(229, 231, 235)
    doc.roundedRect(126, finalY + 6, 70, 14, 3, 3)
    doc.setTextColor(205, 24, 24)
    doc.setFontSize(10)
    doc.text('Total General', 130, finalY + 12)
    doc.setTextColor(23, 23, 23)
    doc.setFontSize(11)
    doc.text(`$ ${formatMoney(totalGeneral)}`, 192, finalY + 12, {
      align: 'right',
    })
  }

  const slug = slugMovimiento(movimiento)
  const now = new Date()
  const filename = `Movimiento_${movimiento.tipo.toLowerCase()}_${
    tipo === 'CHOFER' ? 'operativo' : 'administrativo'
  }_${slug}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`
  doc.save(filename)
}

export function exportarMovimientosInventarioExcel(
  movimientos: MovimientoInventario[],
): void {
  const rows = movimientos.map((mov) => ({
    Fecha: formatFechaHora(mov.fecha),
    Tipo: mov.tipo,
    Detalle: detalleResumen(mov),
    Documento: docResumen(mov),
    Items: mov.items.length,
    Chofer: mov.transporte?.chofer || '—',
    Patente: mov.transporte?.patente || '—',
    Precinto: mov.transporte?.precinto || '—',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')

  const now = new Date()
  const filename = `Movimientos_inventario_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.xlsx`
  XLSX.writeFile(wb, filename)
}

export function exportarRemitoTransportePdf(
  movimiento: MovimientoInventario,
  unidadesPorInsumoId: Map<string, string>,
  tipo: TipoRemitoTransportePdf,
): void {
  if (movimiento.tipo !== 'EGRESO') {
    throw new Error('El PDF de remito solo aplica a egresos.')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  let y = 18

  doc.setFillColor(205, 24, 24)
  doc.roundedRect(margin, y - 8, 182, 16, 3, 3, 'F')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text(tituloMovimientoPdf(movimiento, tipo), margin + 4, y + 2)

  y += 18
  doc.setTextColor(23, 23, 23)
  doc.setFontSize(10)
  doc.text(`Fecha: ${formatFecha(movimiento.fecha)}`, margin, y)
  doc.text(`Nro. de remito: ${movimiento.numeroDocumento || '—'}`, 130, y)

  y += 9
  doc.setDrawColor(229, 231, 235)
  doc.roundedRect(margin, y, 182, 28, 3, 3)
  doc.setTextColor(205, 24, 24)
  doc.setFontSize(11)
  doc.text('Datos del destino', margin + 3, y + 6)
  doc.setTextColor(23, 23, 23)
  doc.setFontSize(10)
  doc.text(`Destino: ${movimiento.destino || '—'}`, margin + 3, y + 13)
  doc.text(
    `Cantidad de ítems: ${movimiento.items.length.toLocaleString('es-AR')}`,
    margin + 3,
    y + 20,
  )

  doc.roundedRect(margin, y + 32, 182, 34, 3, 3)
  doc.setTextColor(205, 24, 24)
  doc.setFontSize(11)
  doc.text('Datos del transporte', margin + 3, y + 38)
  doc.setTextColor(23, 23, 23)
  doc.setFontSize(10)
  doc.text(`Chofer: ${movimiento.transporte?.chofer || '—'}`, margin + 3, y + 45)
  doc.text(`Patente: ${movimiento.transporte?.patente || '—'}`, margin + 3, y + 52)
  doc.text(
    `Precinto: ${movimiento.transporte?.precinto || '—'}`,
    margin + 3,
    y + 59,
  )

  const totalGeneral = movimiento.items.reduce((acc, item) => {
    const costo = item.costoPorUnidadBaseSnapshot
    if (costo == null || !Number.isFinite(costo)) return acc
    return acc + Number(item.cantidad) * costo
  }, 0)

  const bodyChofer = movimiento.items.map((item) => {
    const observaciones = [
      item.lote?.trim() ? `Lote: ${item.lote.trim()}` : null,
      item.fechaVencimiento ? `Vto: ${formatVto(item.fechaVencimiento)}` : null,
      item.temperatura?.trim() ? `Temp: ${item.temperatura.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ')

    return [
      item.nombreSnapshot,
      Number(item.cantidad).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
      unidadesPorInsumoId.get(item.insumoId) || '—',
      observaciones || '—',
    ]
  })

  const bodyAdministrativo = movimiento.items.map((item) => {
    const costo = item.costoPorUnidadBaseSnapshot
    const subtotal =
      costo != null && Number.isFinite(costo)
        ? Number(item.cantidad) * costo
        : null

    return [
      item.nombreSnapshot,
      Number(item.cantidad).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      }),
      unidadesPorInsumoId.get(item.insumoId) || '—',
      item.lote?.trim() || '—',
      formatVto(item.fechaVencimiento),
      formatMoney(costo),
      formatMoney(subtotal),
    ]
  })

  autoTable(doc, {
    startY: y + 72,
    head:
      tipo === 'CHOFER'
        ? [['Nombre del Insumo', 'Cantidad', 'Unidad', 'Observaciones']]
        : [[
            'Nombre del Insumo',
            'Cantidad',
            'Unidad',
            'Lote',
            'Vencimiento',
            'Precio Unitario',
            'Subtotal',
          ]],
    body: tipo === 'CHOFER' ? bodyChofer : bodyAdministrativo,
    styles: {
      fontSize: tipo === 'CHOFER' ? 9.2 : 8.7,
      cellPadding: 2.4,
      textColor: [23, 23, 23],
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [205, 24, 24],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin, right: margin },
    columnStyles:
      tipo === 'CHOFER'
        ? {
            0: { cellWidth: 72 },
            1: { cellWidth: 22, halign: 'right' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 58 },
          }
        : {
            0: { cellWidth: 48 },
            1: { cellWidth: 18, halign: 'right' },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 24 },
            4: { cellWidth: 24 },
            5: { cellWidth: 24, halign: 'right' },
            6: { cellWidth: 28, halign: 'right' },
          },
  })

  if (tipo === 'ADMINISTRATIVO') {
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? y + 72
    doc.setDrawColor(229, 231, 235)
    doc.roundedRect(126, finalY + 6, 70, 14, 3, 3)
    doc.setTextColor(205, 24, 24)
    doc.setFontSize(10)
    doc.text('Total General', 130, finalY + 12)
    doc.setTextColor(23, 23, 23)
    doc.setFontSize(11)
    doc.text(`$ ${formatMoney(totalGeneral)}`, 192, finalY + 12, {
      align: 'right',
    })
  }

  const slug = safeFilenamePart(movimiento.numeroDocumento || movimiento.id)
  const now = new Date()
  const filename = `${
    tipo === 'CHOFER' ? 'Remito_chofer' : 'Remito_administrativo'
  }_${slug}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`
  doc.save(filename)
}
