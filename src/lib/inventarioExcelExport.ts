import * as XLSX from 'xlsx'
import { formatLabelInsumo, type Insumo } from './insumos'

export type InventarioLoteFila = {
  lote: string
  fechaVencimiento: string | null
  stock: number
}

export type InventarioStockFila = {
  insumo: Insumo
  stockTotal: number
  lotes: InventarioLoteFila[]
}

const COLUMNAS_INVENTARIO = [
  'Artículo',
  'Fecha vto',
  'Lote',
  'Cantidad',
  'Unidad de medida',
] as const

export function formatFechaVencimientoInventarioExcel(value: string | null): string {
  if (!value?.trim()) return '—'
  const t = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const [y, m, d] = t.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

function etiquetaLoteExcel(lote: string | undefined | null): string {
  const t = lote?.trim() ?? ''
  if (!t || t === 'Sin lote') return '—'
  return t
}

/** Una fila por lote (o una fila agregada si no hay trazabilidad por lote). */
export function filasExcelInventarioPorLote(
  filas: InventarioStockFila[],
): (string | number)[][] {
  return filas.flatMap((f) => {
    const articulo = formatLabelInsumo(f.insumo)
    const unidad = f.insumo.unidadBase

    if (f.lotes.length === 0) {
      return [[articulo, '—', '—', f.stockTotal, unidad]]
    }

    return f.lotes.map((l) => [
      articulo,
      formatFechaVencimientoInventarioExcel(l.fechaVencimiento),
      etiquetaLoteExcel(l.lote),
      l.stock,
      unidad,
    ])
  })
}

export function exportarInventarioStockExcel(input: {
  /** Filas ya filtradas según la vista (búsqueda, rubro, ocultar sin stock, etc.). */
  filas: InventarioStockFila[]
  ubicacionId?: string
  basename: string
}): void {
  const filasPorLote = filasExcelInventarioPorLote(input.filas)
  const aoa: (string | number)[][] = [
    [...COLUMNAS_INVENTARIO],
    ...(filasPorLote.length
      ? filasPorLote
      : [['Sin datos con los filtros actuales', '—', '—', '—', '—']]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 44 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 16 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')

  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const suf = input.ubicacionId?.trim()
    ? `_${input.ubicacionId.trim().toUpperCase()}`
    : ''

  XLSX.writeFile(
    wb,
    `${input.basename}${suf}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.xlsx`,
  )
}
