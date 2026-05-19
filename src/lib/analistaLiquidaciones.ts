import type { RegistroComedor } from '../types/comedor'
import type { HistorialPernocte } from '../types/hoteleria'
import { nochesEnRango } from './hoteleriaPernoctes'

export type ResumenLiquidacionEmpresa = {
  empresa: string
  pernoctes: number
  desayunos: number
  meriendas: number
  almuerzosBase: number
  refrigeriosAlmuerzo: number
  cenas: number
  refrigeriosCenaNochero: number
}

function normEmp(s: string): string {
  const t = s.trim()
  return t ? t : '—'
}

export function empresasUnicasOrdenadas(
  registros: RegistroComedor[],
  historial: HistorialPernocte[],
  desdeYmd: string,
  hastaYmd: string,
): string[] {
  const set = new Set<string>()
  for (const r of registros) set.add(normEmp(r.empresa))
  for (const h of historial) {
    if (nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd) > 0) {
      set.add(normEmp(h.empresa))
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

export function buildResumenLiquidacionPorEmpresa(
  registros: RegistroComedor[],
  historial: HistorialPernocte[],
  desdeYmd: string,
  hastaYmd: string,
): ResumenLiquidacionEmpresa[] {
  const empresas = empresasUnicasOrdenadas(registros, historial, desdeYmd, hastaYmd)
  const out: ResumenLiquidacionEmpresa[] = []

  for (const empresa of empresas) {
    let pernoctes = 0
    for (const h of historial) {
      if (normEmp(h.empresa) !== empresa) continue
      pernoctes += nochesEnRango(h.fechaCheckIn, h.fechaCheckOut, desdeYmd, hastaYmd)
    }

    let desayunos = 0
    let meriendas = 0
    let almuerzosBase = 0
    let refrigeriosAlmuerzo = 0
    let cenas = 0
    let refrigeriosCenaNochero = 0

    for (const r of registros) {
      if (normEmp(r.empresa) !== empresa) continue
      if (r.diaOperativo < desdeYmd || r.diaOperativo > hastaYmd) continue
      switch (r.servicio) {
        case 'DESAYUNO':
          desayunos += 1
          break
        case 'MERIENDA':
          meriendas += 1
          break
        case 'ALMUERZO':
          if (r.contieneRefrigerio === true) refrigeriosAlmuerzo += 1
          else almuerzosBase += 1
          break
        case 'CENA':
          cenas += 1
          break
        case 'CENA_NOCHERO':
          refrigeriosCenaNochero += 1
          break
        default:
          break
      }
    }

    out.push({
      empresa,
      pernoctes,
      desayunos,
      meriendas,
      almuerzosBase,
      refrigeriosAlmuerzo,
      cenas,
      refrigeriosCenaNochero,
    })
  }

  return out
}
