import * as XLSX from 'xlsx'
import type { SolicitudMercaderia } from './solicitudesMercaderia'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40)
}

/**
 * Una única planilla con datos de cabecera + tabla de insumos para picking.
 */
export function exportarSolicitudMercaderiaExcel(s: SolicitudMercaderia): void {
  const fc = s.fechaCreacion
  const fechaCreacionStr = fc
    ? `${pad(fc.getDate())}/${pad(fc.getMonth() + 1)}/${fc.getFullYear()} ${pad(fc.getHours())}:${pad(fc.getMinutes())}`
    : '—'

  const metaRows: (string | number)[][] = [
    ['Solicitud de mercadería — exportación para depósito'],
    [],
    ['ID documento', s.id],
    ['Fecha de creación', fechaCreacionStr],
    ['Fecha entrega esperada', s.fechaEntregaEsperada || '—'],
    ['Prioridad', s.prioridad],
    ['Estado', s.estado],
    ['Observaciones depósito', s.observacionesDeposito || '—'],
    ['Observaciones recepción (cocina)', s.observacionesRecepcion || '—'],
    [],
    ['Detalle de insumos'],
    ['Producto', 'Cantidad', 'Unidad', 'Presentación'],
  ]

  const itemRows = s.items.map((it) => [
    it.producto,
    it.cantidad,
    it.unidadMedida,
    it.presentacion,
  ])

  const ws = XLSX.utils.aoa_to_sheet([...metaRows, ...itemRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitud')

  const slug = safeFilenamePart(s.id)
  const nombreArchivo = `Solicitud_mercaderia_${slug}_${pad(new Date().getDate())}-${pad(new Date().getMonth() + 1)}-${new Date().getFullYear()}.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
}
