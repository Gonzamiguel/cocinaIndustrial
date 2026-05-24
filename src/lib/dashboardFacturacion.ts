import type { RegistroComedor } from '../types/comedor'
import type { HistorialPernocte, PadronPersona } from '../types/hoteleria'
import { nochesEnRango } from './hoteleriaPernoctes'

export type FilaFacturacionOperario = {
  dni: string
  nombreCompleto: string
  empresa: string
  totalDesayunos: number
  totalAlmuerzos: number
  totalRefrigerios: number
  totalMeriendas: number
  totalViandas: number
  totalCenas: number
  totalCenasNocheros: number
  totalNoches: number
}

export type TotalesFacturacion = Pick<
  FilaFacturacionOperario,
  | 'totalDesayunos'
  | 'totalAlmuerzos'
  | 'totalRefrigerios'
  | 'totalMeriendas'
  | 'totalViandas'
  | 'totalCenas'
  | 'totalCenasNocheros'
  | 'totalNoches'
>

const CAMPOS_TOTALES_FACTURACION: (keyof TotalesFacturacion)[] = [
  'totalNoches',
  'totalDesayunos',
  'totalAlmuerzos',
  'totalRefrigerios',
  'totalMeriendas',
  'totalViandas',
  'totalCenas',
  'totalCenasNocheros',
]

function normEmpresa(s: string): string {
  const t = s.trim()
  return t || '—'
}

function normDni(s: string): string {
  const t = s.trim()
  return t || ''
}

/** Viandas en terminal: `MERIENDA` + observaciones «Vianda». */
export function esRegistroVianda(registro: RegistroComedor): boolean {
  if (registro.servicio !== 'MERIENDA') return false
  const obs = (registro.observaciones ?? '').trim().toLowerCase()
  return obs === 'vianda' || obs.includes('vianda')
}

function crearFilaVacía(dni: string, nombreCompleto: string, empresa: string): FilaFacturacionOperario {
  return {
    dni,
    nombreCompleto: nombreCompleto.trim() || '—',
    empresa: normEmpresa(empresa),
    totalDesayunos: 0,
    totalAlmuerzos: 0,
    totalRefrigerios: 0,
    totalMeriendas: 0,
    totalViandas: 0,
    totalCenas: 0,
    totalCenasNocheros: 0,
    totalNoches: 0,
  }
}

function obtenerOCrearFila(
  map: Map<string, FilaFacturacionOperario>,
  dni: string,
  nombreCompleto: string,
  empresa: string,
): FilaFacturacionOperario {
  let fila = map.get(dni)
  if (!fila) {
    fila = crearFilaVacía(dni, nombreCompleto, empresa)
    map.set(dni, fila)
    return fila
  }
  if (fila.nombreCompleto === '—' && nombreCompleto.trim()) {
    fila.nombreCompleto = nombreCompleto.trim()
  }
  if (fila.empresa === '—' && empresa.trim()) {
    fila.empresa = normEmpresa(empresa)
  }
  return fila
}

/** Incrementa el contador de facturación según el servicio exacto del registro. */
export function acumularServicioComedorEnFila(
  fila: FilaFacturacionOperario,
  registro: RegistroComedor,
): void {
  switch (registro.servicio) {
    case 'DESAYUNO':
      fila.totalDesayunos += 1
      break
    case 'ALMUERZO':
      if (registro.contieneRefrigerio === true) fila.totalRefrigerios += 1
      else fila.totalAlmuerzos += 1
      break
    case 'MERIENDA':
      if (esRegistroVianda(registro)) fila.totalViandas += 1
      else fila.totalMeriendas += 1
      break
    case 'CENA':
      fila.totalCenas += 1
      break
    case 'CENA_NOCHERO':
      fila.totalCenasNocheros += 1
      break
    default:
      break
  }
}

/** Empresas únicas del padrón y de los datos operativos en el rango. */
export function empresasFacturacionOrdenadas(
  padron: PadronPersona[],
  registros: RegistroComedor[],
  historial: HistorialPernocte[],
  desdeYmd: string,
  hastaYmd: string,
): string[] {
  const set = new Set<string>()
  for (const p of padron) {
    const e = p.empresa.trim()
    if (e) set.add(e)
  }
  for (const r of registros) {
    if (r.diaOperativo < desdeYmd || r.diaOperativo > hastaYmd) continue
    const e = r.empresa.trim()
    if (e) set.add(e)
  }
  for (const h of historial) {
    if (nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd) <= 0) continue
    const e = h.empresa.trim()
    if (e) set.add(e)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/**
 * Agrupa consumos de comedor y noches de hotelería por DNI en el rango indicado.
 * `empresaFiltro` vacío = todas las empresas.
 */
export function consolidarFacturacionPorDni(
  registros: RegistroComedor[],
  historial: HistorialPernocte[],
  padronPorId: Map<string, PadronPersona>,
  desdeYmd: string,
  hastaYmd: string,
  empresaFiltro = '',
): FilaFacturacionOperario[] {
  const map = new Map<string, FilaFacturacionOperario>()
  const empresaSel = empresaFiltro.trim()

  for (const r of registros) {
    if (r.diaOperativo < desdeYmd || r.diaOperativo > hastaYmd) continue
    const empresa = normEmpresa(r.empresa)
    if (empresaSel && empresa !== empresaSel) continue

    const dni = normDni(r.dni)
    if (!dni) continue

    const nombreCompleto = `${r.nombre} ${r.apellido}`.trim() || '—'
    const fila = obtenerOCrearFila(map, dni, nombreCompleto, empresa)
    acumularServicioComedorEnFila(fila, r)
  }

  for (const h of historial) {
    const noches = nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd)
    if (noches <= 0) continue

    const persona = padronPorId.get(h.personaId)
    const dni = normDni(persona?.dni ?? '')
    if (!dni) continue

    const empresa = normEmpresa(h.empresa || persona?.empresa || '')
    if (empresaSel && empresa !== empresaSel) continue

    const nombreCompleto = persona
      ? `${persona.nombre} ${persona.apellido}`.trim() || '—'
      : '—'
    const fila = obtenerOCrearFila(map, dni, nombreCompleto, empresa)
    fila.totalNoches += noches
  }

  return [...map.values()].sort((a, b) => {
    const cmp = a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return a.dni.localeCompare(b.dni, 'es', { numeric: true })
  })
}

export function sumarTotalesFacturacion(filas: FilaFacturacionOperario[]): TotalesFacturacion {
  const inicial = CAMPOS_TOTALES_FACTURACION.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as TotalesFacturacion,
  )

  return filas.reduce((acc, f) => {
    for (const key of CAMPOS_TOTALES_FACTURACION) {
      acc[key] += f[key]
    }
    return acc
  }, { ...inicial })
}

export function filtrarFilasFacturacionPorTexto(
  filas: FilaFacturacionOperario[],
  busqueda: string,
): FilaFacturacionOperario[] {
  const q = busqueda.trim().toLowerCase()
  if (!q) return filas
  return filas.filter((f) => {
    const dni = f.dni.toLowerCase()
    const nombre = f.nombreCompleto.toLowerCase()
    return dni.includes(q) || nombre.includes(q)
  })
}

export const COLUMNAS_SABANA_FACTURACION = [
  'DNI',
  'Nombre',
  'Empresa',
  'Noches',
  'Desayunos',
  'Almuerzos',
  'Refrigerios',
  'Meriendas',
  'Viandas',
  'Cenas',
  'Cenas Nocheros',
] as const

export function filaFacturacionComoFilasTabla(fila: FilaFacturacionOperario): (string | number)[] {
  return [
    fila.dni,
    fila.nombreCompleto,
    fila.empresa,
    fila.totalNoches,
    fila.totalDesayunos,
    fila.totalAlmuerzos,
    fila.totalRefrigerios,
    fila.totalMeriendas,
    fila.totalViandas,
    fila.totalCenas,
    fila.totalCenasNocheros,
  ]
}

export function totalesFacturacionComoFilaTabla(totales: TotalesFacturacion): (string | number)[] {
  return [
    'TOTALES GENERALES',
    '',
    '',
    totales.totalNoches,
    totales.totalDesayunos,
    totales.totalAlmuerzos,
    totales.totalRefrigerios,
    totales.totalMeriendas,
    totales.totalViandas,
    totales.totalCenas,
    totales.totalCenasNocheros,
  ]
}

export const CANTIDAD_COLUMNAS_SABANA_FACTURACION = COLUMNAS_SABANA_FACTURACION.length
