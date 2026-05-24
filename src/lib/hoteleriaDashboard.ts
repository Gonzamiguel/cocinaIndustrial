import type { Cama, HistorialPernocte, PadronPersona } from '../types/hoteleria'
import { diasEnRango } from './hoteleriaPernoctes'

export type TipoMovimientoHoteleria = 'Check-in' | 'Check-out' | 'Cambio de habitación'

export type FiltrosHoteleriaDashboard = {
  desdeYmd: string
  hastaYmd: string
  empresa: string
  sector: string
}

export type EstadoDiaEstancia = '0' | '1' | 'S'

export type FilaCuadrillaEstancia = {
  personaId: string
  dni: string
  empresa: string
  nombre: string
  apellido: string
  /** Clave YYYY-MM-DD → 1 pernocte, S día de salida, 0 ausente. */
  nochesPorDia: Record<string, EstadoDiaEstancia>
  /** Solo noches facturables (`1`), sin contar días de salida (`S`). */
  totalNoches: number
}

export type FilaMovimientoHoteleria = {
  id: string
  /** Id del documento en `historial_pernoctes` (para editar / eliminar). */
  historialId: string
  personaId: string
  camaId: string
  fechaCheckIn: Date | null
  fechaCheckOut: Date | null
  fechaHora: Date | null
  dni: string
  persona: string
  empresa: string
  tipo: TipoMovimientoHoteleria
  habitacionCama: string
}

export type KpisHoteleriaDashboard = {
  poblacionActual: number
  totalCheckIns: number
  totalCheckOuts: number
  camasLibres: number
  camasTotales: number
}

function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function ymdDeFecha(f: Date | null): string | null {
  if (!f) return null
  return ymdLocal(startOfDay(f))
}

function fechaEnRango(ymd: string | null, desde: string, hasta: string): boolean {
  if (!ymd) return false
  return ymd >= desde && ymd <= hasta
}

export function etiquetaCama(cama: Cama | undefined): string {
  if (!cama) return '—'
  return `${cama.sector} · ${cama.habitacion} · ${cama.denominacion}`
}

export function empresaDeHistorial(
  h: HistorialPernocte,
  padron?: PadronPersona,
): string {
  return (h.empresa?.trim() || padron?.empresa?.trim() || '').trim()
}

export function historialPasaFiltros(
  h: HistorialPernocte,
  padronPorId: Map<string, PadronPersona>,
  camaPorId: Map<string, Cama>,
  filtros: FiltrosHoteleriaDashboard,
): boolean {
  const p = padronPorId.get(h.personaId)
  if (filtros.empresa) {
    const emp = empresaDeHistorial(h, p)
    if (emp !== filtros.empresa) return false
  }
  if (filtros.sector) {
    const sector = camaPorId.get(h.camaId)?.sector?.trim() ?? ''
    if (sector !== filtros.sector) return false
  }
  return true
}

export function camaPasaFiltros(
  c: Cama,
  padronPorId: Map<string, PadronPersona>,
  filtros: Pick<FiltrosHoteleriaDashboard, 'empresa' | 'sector'>,
): boolean {
  if (filtros.sector && (c.sector?.trim() ?? '') !== filtros.sector) return false
  if (filtros.empresa) {
    const p = c.personaId ? padronPorId.get(c.personaId) : undefined
    const emp = c.ocupanteEmpresa?.trim() || p?.empresa?.trim() || ''
    if (emp !== filtros.empresa) return false
  }
  return true
}

type IntervaloEstadia = {
  checkInYmd: string
  checkOutYmd: string | null
}

/** La estadía solapa el rango filtrado [desde, hasta]. */
function historialSolapaRango(
  h: HistorialPernocte,
  desdeYmd: string,
  hastaYmd: string,
): boolean {
  const checkInYmd = ymdDeFecha(h.fechaCheckIn)
  if (!checkInYmd) return false
  const checkOutYmd = ymdDeFecha(h.fechaCheckOut)
  if (checkInYmd > hastaYmd) return false
  if (checkOutYmd && checkOutYmd < desdeYmd) return false
  return true
}

function combinarEstadosDia(
  a: EstadoDiaEstancia,
  b: EstadoDiaEstancia,
): EstadoDiaEstancia {
  if (a === '1' || b === '1') return '1'
  if (a === 'S' || b === 'S') return 'S'
  return '0'
}

/**
 * Valor de celda para un día del mes según intervalo [check-in, check-out).
 * Comparación solo por YYYY-MM-DD (sin horas).
 */
function valorDiaEnIntervalo(
  ymd: string,
  intervalo: IntervaloEstadia,
  hastaYmd: string,
): EstadoDiaEstancia {
  if (ymd < intervalo.checkInYmd || ymd > hastaYmd) return '0'

  if (intervalo.checkOutYmd) {
    if (ymd === intervalo.checkOutYmd) return 'S'
    if (ymd >= intervalo.checkInYmd && ymd < intervalo.checkOutYmd) return '1'
    return '0'
  }

  if (ymd >= intervalo.checkInYmd) return '1'
  return '0'
}

/** Intervalos de estadía por persona a partir de todo el historial filtrado. */
export function intervalosEstadiaPorPersona(
  historial: HistorialPernocte[],
  padronPorId: Map<string, PadronPersona>,
  camaPorId: Map<string, Cama>,
  filtros: FiltrosHoteleriaDashboard,
): Map<string, { intervalos: IntervaloEstadia[]; meta: Omit<FilaCuadrillaEstancia, 'nochesPorDia' | 'totalNoches'> }> {
  const { desdeYmd, hastaYmd } = filtros
  const porPersona = new Map<
    string,
    { intervalos: IntervaloEstadia[]; meta: Omit<FilaCuadrillaEstancia, 'nochesPorDia' | 'totalNoches'> }
  >()

  for (const h of historial) {
    if (!historialPasaFiltros(h, padronPorId, camaPorId, filtros)) continue
    if (!historialSolapaRango(h, desdeYmd, hastaYmd)) continue
    const checkInYmd = ymdDeFecha(h.fechaCheckIn)
    if (!checkInYmd) continue

    const p = padronPorId.get(h.personaId)
    const dni = p?.dni?.trim() || '—'
    let entry = porPersona.get(dni)
    if (!entry) {
      entry = {
        intervalos: [],
        meta: {
          personaId: h.personaId,
          dni,
          empresa: empresaDeHistorial(h, p) || '—',
          nombre: p?.nombre?.trim() || '—',
          apellido: p?.apellido?.trim() || '—',
        },
      }
      porPersona.set(dni, entry)
    }
    entry.intervalos.push({
      checkInYmd,
      checkOutYmd: ymdDeFecha(h.fechaCheckOut),
    })
  }

  for (const entry of porPersona.values()) {
    entry.intervalos.sort((a, b) => a.checkInYmd.localeCompare(b.checkInYmd))
  }

  return porPersona
}

export function calcularKpisHoteleria(input: {
  historial: HistorialPernocte[]
  camas: Cama[]
  padronPorId: Map<string, PadronPersona>
  camaPorId: Map<string, Cama>
  filtros: FiltrosHoteleriaDashboard
}): KpisHoteleriaDashboard {
  const { historial, camas, padronPorId, camaPorId, filtros } = input
  const { desdeYmd, hastaYmd, empresa, sector } = filtros

  let totalCheckIns = 0
  let totalCheckOuts = 0
  for (const h of historial) {
    if (!historialPasaFiltros(h, padronPorId, camaPorId, filtros)) continue
    const ymdIn = ymdDeFecha(h.fechaCheckIn)
    const ymdOut = ymdDeFecha(h.fechaCheckOut)
    if (fechaEnRango(ymdIn, desdeYmd, hastaYmd)) totalCheckIns++
    if (fechaEnRango(ymdOut, desdeYmd, hastaYmd)) totalCheckOuts++
  }

  const pobIds = new Set<string>()
  for (const c of camas) {
    if (c.estado !== 'OCUPADA' || !c.personaId) continue
    if (!camaPasaFiltros(c, padronPorId, { empresa, sector })) continue
    pobIds.add(c.personaId)
  }

  let camasLibres = 0
  let camasTotales = 0
  for (const c of camas) {
    if (!camaPasaFiltros(c, padronPorId, { empresa, sector })) continue
    camasTotales++
    if (c.estado === 'LIBRE') camasLibres++
  }

  return {
    poblacionActual: pobIds.size,
    totalCheckIns,
    totalCheckOuts,
    camasLibres,
    camasTotales,
  }
}

/**
 * Grilla 1 / S / 0: agrupa por DNI, arma intervalos de estadía desde historial y marca cada día del rango.
 */
export function filasCuadrillaEstancia(input: {
  historial: HistorialPernocte[]
  padronPorId: Map<string, PadronPersona>
  camaPorId: Map<string, Cama>
  filtros: FiltrosHoteleriaDashboard
}): { dias: string[]; filas: FilaCuadrillaEstancia[] } {
  const { historial, padronPorId, camaPorId, filtros } = input
  const dias = diasEnRango(filtros.desdeYmd, filtros.hastaYmd)
  const porDni = intervalosEstadiaPorPersona(historial, padronPorId, camaPorId, filtros)

  const filas: FilaCuadrillaEstancia[] = []

  for (const { intervalos, meta } of porDni.values()) {
    const nochesPorDia: Record<string, EstadoDiaEstancia> = {}
    let totalNoches = 0
    let tieneActividad = false
    for (const ymd of dias) {
      let valor: EstadoDiaEstancia = '0'
      for (const iv of intervalos) {
        valor = combinarEstadosDia(valor, valorDiaEnIntervalo(ymd, iv, filtros.hastaYmd))
      }
      nochesPorDia[ymd] = valor
      if (valor === '1') totalNoches++
      if (valor !== '0') tieneActividad = true
    }
    if (tieneActividad) {
      filas.push({ ...meta, nochesPorDia, totalNoches })
    }
  }

  filas.sort((a, b) => {
    const c = a.apellido.localeCompare(b.apellido, 'es', { sensitivity: 'base' })
    if (c !== 0) return c
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })

  return { dias, filas }
}

type EventoInterno = {
  ts: number
  tipo: TipoMovimientoHoteleria
  h: HistorialPernocte
}

export function filasMovimientosHoteleria(input: {
  historial: HistorialPernocte[]
  padronPorId: Map<string, PadronPersona>
  camaPorId: Map<string, Cama>
  filtros: FiltrosHoteleriaDashboard
}): FilaMovimientoHoteleria[] {
  const { historial, padronPorId, camaPorId, filtros } = input
  const { desdeYmd, hastaYmd } = filtros
  const eventos: EventoInterno[] = []

  for (const h of historial) {
    if (!historialPasaFiltros(h, padronPorId, camaPorId, filtros)) continue
    const ymdIn = ymdDeFecha(h.fechaCheckIn)
    const ymdOut = ymdDeFecha(h.fechaCheckOut)
    if (fechaEnRango(ymdIn, desdeYmd, hastaYmd) && h.fechaCheckIn) {
      eventos.push({ ts: h.fechaCheckIn.getTime(), tipo: 'Check-in', h })
    }
    if (fechaEnRango(ymdOut, desdeYmd, hastaYmd) && h.fechaCheckOut) {
      eventos.push({ ts: h.fechaCheckOut.getTime(), tipo: 'Check-out', h })
    }
  }

  eventos.sort((a, b) => b.ts - a.ts)

  const usados = new Set<string>()
  const filas: FilaMovimientoHoteleria[] = []

  const porPersona = new Map<string, EventoInterno[]>()
  for (const ev of eventos) {
    const pid = ev.h.personaId
    const list = porPersona.get(pid) ?? []
    list.push(ev)
    porPersona.set(pid, list)
  }

  for (const [, lista] of porPersona) {
    lista.sort((a, b) => a.ts - b.ts)
    for (let i = 0; i < lista.length; i++) {
      const out = lista[i]
      if (out.tipo !== 'Check-out' || usados.has(`${out.h.id}-out`)) continue
      const ymdOut = ymdDeFecha(out.h.fechaCheckOut)
      for (let j = i + 1; j < lista.length; j++) {
        const inn = lista[j]
        if (inn.tipo !== 'Check-in' || usados.has(`${inn.h.id}-in`)) continue
        const ymdIn = ymdDeFecha(inn.h.fechaCheckIn)
        if (
          ymdOut &&
          ymdIn === ymdOut &&
          out.h.camaId !== inn.h.camaId &&
          inn.h.fechaCheckIn &&
          out.h.fechaCheckOut
        ) {
          const p = padronPorId.get(inn.h.personaId)
          const camaO = camaPorId.get(out.h.camaId)
          const camaD = camaPorId.get(inn.h.camaId)
          filas.push({
            id: `traslado-${out.h.id}-${inn.h.id}`,
            historialId: inn.h.id,
            personaId: inn.h.personaId,
            camaId: inn.h.camaId,
            fechaCheckIn: inn.h.fechaCheckIn,
            fechaCheckOut: inn.h.fechaCheckOut,
            fechaHora: inn.h.fechaCheckIn,
            dni: p?.dni?.trim() || '—',
            persona: p ? `${p.apellido}, ${p.nombre}`.trim() : '—',
            empresa: empresaDeHistorial(inn.h, p) || '—',
            tipo: 'Cambio de habitación',
            habitacionCama: `${etiquetaCama(camaO)} → ${etiquetaCama(camaD)}`,
          })
          usados.add(`${out.h.id}-out`)
          usados.add(`${inn.h.id}-in`)
          break
        }
      }
    }
  }

  for (const ev of eventos) {
    const key =
      ev.tipo === 'Check-in' ? `${ev.h.id}-in` : ev.tipo === 'Check-out' ? `${ev.h.id}-out` : ''
    if (key && usados.has(key)) continue
    const p = padronPorId.get(ev.h.personaId)
    const cama = camaPorId.get(ev.h.camaId)
    const fechaHora =
      ev.tipo === 'Check-out' ? ev.h.fechaCheckOut : ev.h.fechaCheckIn
    filas.push({
      id: `${ev.tipo}-${ev.h.id}`,
      historialId: ev.h.id,
      personaId: ev.h.personaId,
      camaId: ev.h.camaId,
      fechaCheckIn: ev.h.fechaCheckIn,
      fechaCheckOut: ev.h.fechaCheckOut,
      fechaHora,
      dni: p?.dni?.trim() || '—',
      persona: p ? `${p.apellido}, ${p.nombre}`.trim() : '—',
      empresa: empresaDeHistorial(ev.h, p) || '—',
      tipo: ev.tipo,
      habitacionCama: etiquetaCama(cama),
    })
  }

  filas.sort((a, b) => (b.fechaHora?.getTime() ?? 0) - (a.fechaHora?.getTime() ?? 0))
  return filas
}
