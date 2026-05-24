import type {
  EstadoDiaEstancia,
  FilaCuadrillaEstancia,
  FilaMovimientoHoteleria,
} from './hoteleriaDashboard'

const COLORES = {
  encabezadoFondo: 'FF8997A6',
  encabezadoTexto: 'FFFFFFFF',
  pernocteFondo: 'FFD4EDDA',
  pernocteTexto: 'FF155724',
  salidaFondo: 'FFF8D7DA',
  salidaTexto: 'FF721C24',
  ausenteFondo: 'FFF8F9FA',
  ausenteTexto: 'FF6C757D',
} as const

const COLS_FIJAS_CUADRILLA = 4
const ANCHO_COL_DIA = 4.5

function aplicarEstiloEncabezado(fila: import('exceljs').Row) {
  fila.height = 22
  fila.eachCell({ includeEmpty: true }, (celda) => {
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORES.encabezadoFondo },
    }
    celda.font = { bold: true, color: { argb: COLORES.encabezadoTexto } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
}

function aplicarEstiloCeldaDia(celda: import('exceljs').Cell, valor: unknown) {
  const texto = String(valor ?? '0')
  celda.alignment = { horizontal: 'center', vertical: 'middle' }

  if (texto === '1') {
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORES.pernocteFondo },
    }
    celda.font = { color: { argb: COLORES.pernocteTexto } }
    return
  }

  if (texto === 'S') {
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORES.salidaFondo },
    }
    celda.font = { bold: true, color: { argb: COLORES.salidaTexto } }
    return
  }

  celda.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORES.ausenteFondo },
  }
  celda.font = { color: { argb: COLORES.ausenteTexto } }
}

function valorCeldaDia(
  nochesPorDia: Record<string, EstadoDiaEstancia>,
  ymd: string,
): EstadoDiaEstancia {
  return nochesPorDia[ymd] ?? '0'
}

export type ExportarHoteleriaExcelInput = {
  movimientos: FilaMovimientoHoteleria[]
  cuadrilla: { dias: string[]; filas: FilaCuadrillaEstancia[] }
  etiquetaDiaColumna: (ymd: string) => string
  formatFechaHora: (fecha: Date | null) => string
  nombreArchivo: string
}

export async function exportarHoteleriaExcel({
  movimientos,
  cuadrilla,
  etiquetaDiaColumna,
  formatFechaHora,
  nombreArchivo,
}: ExportarHoteleriaExcelInput): Promise<void> {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cocina Industrial'
  wb.created = new Date()

  const wsMov = wb.addWorksheet('Movimientos')
  const headerMov = wsMov.addRow([
    'Fecha y hora',
    'DNI',
    'Persona',
    'Empresa',
    'Tipo de movimiento',
    'Habitación / cama',
  ])
  aplicarEstiloEncabezado(headerMov)
  for (const m of movimientos) {
    wsMov.addRow([
      formatFechaHora(m.fechaHora),
      m.dni,
      m.persona,
      m.empresa,
      m.tipo,
      m.habitacionCama,
    ])
  }
  wsMov.getColumn(1).width = 18
  wsMov.getColumn(2).width = 12
  wsMov.getColumn(3).width = 24
  wsMov.getColumn(4).width = 20
  wsMov.getColumn(5).width = 18
  wsMov.getColumn(6).width = 36

  const wsCuad = wb.addWorksheet('Control_Estancia')
  const encabezadoCuad = [
    'DNI',
    'Empresa',
    'Nombre',
    'Apellido',
    ...cuadrilla.dias.map(etiquetaDiaColumna),
  ]
  const filaEncabezadoCuad = wsCuad.addRow(encabezadoCuad)
  aplicarEstiloEncabezado(filaEncabezadoCuad)

  for (const persona of cuadrilla.filas) {
    const fila = wsCuad.addRow([
      persona.dni,
      persona.empresa,
      persona.nombre,
      persona.apellido,
      ...cuadrilla.dias.map((ymd) => valorCeldaDia(persona.nochesPorDia, ymd)),
    ])

    cuadrilla.dias.forEach((_ymd, indiceDia) => {
      const col = COLS_FIJAS_CUADRILLA + indiceDia + 1
      aplicarEstiloCeldaDia(fila.getCell(col), fila.getCell(col).value)
    })
  }

  wsCuad.getColumn(1).width = 12
  wsCuad.getColumn(2).width = 20
  wsCuad.getColumn(3).width = 14
  wsCuad.getColumn(4).width = 14
  for (let col = COLS_FIJAS_CUADRILLA + 1; col <= COLS_FIJAS_CUADRILLA + cuadrilla.dias.length; col++) {
    wsCuad.getColumn(col).width = ANCHO_COL_DIA
  }

  wsCuad.views = [{ state: 'frozen', ySplit: 1, xSplit: COLS_FIJAS_CUADRILLA }]

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    nombreArchivo,
  )
}
