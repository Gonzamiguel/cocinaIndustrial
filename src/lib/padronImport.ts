import * as XLSX from 'xlsx'
import type { FilaCargaMasivaPadron } from '../types/hoteleria'
import {
  sanitizarDniInput,
  sanitizarEmpresaInput,
  sanitizarNombreApellidoInput,
} from './padronFormInput'

function valorCelda(row: Record<string, unknown>, ...nombresColumna: string[]): string {
  for (const nombre of nombresColumna) {
    const clave = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === nombre.toLowerCase(),
    )
    if (clave !== undefined) return String(row[clave] ?? '').trim()
  }
  return ''
}

/** Texto seguro: vacío/undefined → '' y MAYÚSCULAS (nombres de persona). */
function textoMayusculasPersona(val: unknown): string {
  return sanitizarNombreApellidoInput(String(val ?? ''))
}

/**
 * Lee la primera hoja con `sheet_to_json` y normaliza filas para carga masiva.
 * DNI solo dígitos; nombres, apellidos y empresa en MAYÚSCULAS.
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
    const dni = sanitizarDniInput(String(valorCelda(row, 'DNI') || ''))
    if (!dni) continue
    const dniClave = dni
    if (vistos.has(dniClave)) continue
    vistos.add(dniClave)

    const nombre = textoMayusculasPersona(valorCelda(row, 'Nombre'))
    const apellido = textoMayusculasPersona(valorCelda(row, 'Apellido'))
    const nombreCompleto = `${nombre} ${apellido}`.trim()
    const empresa = sanitizarEmpresaInput(valorCelda(row, 'Empresa'))

    if (!nombreCompleto) continue

    const legajo = String(valorCelda(row, 'Legajo') || '').trim()
    const posicion = sanitizarEmpresaInput(valorCelda(row, 'Posición', 'Posicion'))
    const sector = sanitizarEmpresaInput(valorCelda(row, 'Sector'))

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
