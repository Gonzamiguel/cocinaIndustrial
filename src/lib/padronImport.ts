import * as XLSX from 'xlsx'
import type { FilaCargaMasivaPadron } from '../types/hoteleria'

function valorCelda(row: Record<string, unknown>, ...nombresColumna: string[]): string {
  for (const nombre of nombresColumna) {
    const clave = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (clave !== undefined) return String(row[clave] ?? '').trim()
  }
  return ''
}

/** Texto seguro: vacío/undefined → '' y MAYÚSCULAS. */
function textoMayusculas(val: unknown): string {
  return String(val ?? '').trim().toUpperCase()
}

/**
 * Lee la primera hoja con `sheet_to_json` y normaliza filas para carga masiva.
 * DNI sin mayúsculas forzadas (solo trim); nombres, apellidos y empresa en MAYÚSCULAS.
 */
export function filasCargaMasivaDesdeWorkbook(wb: XLSX.WorkBook): FilaCargaMasivaPadron[] {
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    throw new Error('El archivo no tiene hojas.')
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
    defval: '',
    raw: false,
  })

  const out: FilaCargaMasivaPadron[] = []
  const vistos = new Set<string>()

  for (const row of rows) {
    const dni = String(valorCelda(row, 'DNI') || '').trim()
    if (!dni) continue
    const dniClave = dni.toUpperCase()
    if (vistos.has(dniClave)) continue
    vistos.add(dniClave)

    const nombreRaw = valorCelda(row, 'Nombre')
    const apellidoRaw = valorCelda(row, 'Apellido')
    const nombre = textoMayusculas(nombreRaw)
    const apellido = textoMayusculas(apellidoRaw)
    const nombreCompleto = `${nombreRaw || ''} ${apellidoRaw || ''}`.trim().toUpperCase()
    const empresa = textoMayusculas(valorCelda(row, 'Empresa') || 'NO ESPECIFICADA')

    if (!nombreCompleto) continue

    const legajo = String(valorCelda(row, 'Legajo') || '').trim()
    const posicion = textoMayusculas(valorCelda(row, 'Posición', 'Posicion'))
    const sector = textoMayusculas(valorCelda(row, 'Sector'))

    const fila: FilaCargaMasivaPadron = {
      dni: dniClave,
      nombre,
      apellido,
      nombreCompleto,
      empresa,
      estado: 'Activo',
    }
    if (legajo) fila.legajo = legajo
    if (posicion) fila.posicion = posicion
    if (sector) fila.sector = sector
    out.push(fila)
  }

  if (!out.length) {
    throw new Error(
      'No se encontraron filas válidas. Verificá las columnas: DNI, Apellido, Nombre, Empresa.',
    )
  }

  return out
}
