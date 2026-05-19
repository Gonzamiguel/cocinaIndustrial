import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COL_PADRON, mapPadron } from './hoteleria'
import type { PadronPersona } from '../types/hoteleria'
import type { RegistroComedor, ServicioComedor } from '../types/comedor'
import { contieneRefrigerioPorServicio } from './servicioComedor'

export const COL_REGISTROS_COMEDOR = 'registros_comedor'

type FirestoreErrorish = { code?: string; message?: string }

function esPermissionDeniedFirestore(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'permission-denied'
  )
}

/** Mensaje cuando faltan reglas publicadas o el rol en `usuarios/{uid}` no coincide. */
export function mensajePermisosTerminalComedor(): string {
  return (
    'Permiso denegado en Firestore. Publicá las reglas del repo: `npm run deploy:firestore-rules`. ' +
    'Verificá que en `usuarios/{tuUID}` el campo `rol` sea exactamente `terminal_comedor`.'
  )
}

export function mensajePermisosRegistrosComedor(): string {
  return (
    'Permiso denegado en `registros_comedor`. Publicá las reglas: `npm run deploy:firestore-rules`. ' +
    'Roles con lectura: `terminal_comedor`, `admin_campamento`.'
  )
}

function tsToDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return null
}

export function mapRegistroComedor(id: string, data: Record<string, unknown>): RegistroComedor {
  const servicio = data.servicio
  const servicioOk: ServicioComedor =
    servicio === 'DESAYUNO' ||
    servicio === 'ALMUERZO' ||
    servicio === 'MERIENDA' ||
    servicio === 'CENA' ||
    servicio === 'CENA_NOCHERO' ||
    servicio === 'FUERA DE HORARIO'
      ? servicio
      : 'FUERA DE HORARIO'

  return {
    id,
    dni: typeof data.dni === 'string' ? data.dni.trim().toUpperCase() : '',
    nombre: typeof data.nombre === 'string' ? data.nombre.trim() : '',
    apellido: typeof data.apellido === 'string' ? data.apellido.trim() : '',
    empresa: typeof data.empresa === 'string' ? data.empresa.trim() : '',
    servicio: servicioOk,
    contieneRefrigerio:
      typeof data.contieneRefrigerio === 'boolean' ? data.contieneRefrigerio : undefined,
    diaOperativo:
      typeof data.diaOperativo === 'string' ? data.diaOperativo.trim() : '',
    fechaHora: tsToDate(data.fechaHora),
    usuarioRegistro:
      typeof data.usuarioRegistro === 'string' ? data.usuarioRegistro.trim() : '',
  }
}

/** Fecha local YYYY-MM-DD (no usar `toISOString`: es UTC y puede cambiar el día). */
export function diaOperativoYmdLocal(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Busca en `padron_personas` por DNI (misma normalización que hotelería). */
export async function buscarPersonaPadronPorDni(dni: string): Promise<PadronPersona | null> {
  const d = dni.trim().toUpperCase()
  if (!d) return null
  const db = getDb()
  try {
    const q = query(collection(db, COL_PADRON), where('dni', '==', d), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return null
    const docSnap = snap.docs[0]!
    return mapPadron(docSnap.id, docSnap.data() as Record<string, unknown>)
  } catch (e) {
    if (esPermissionDeniedFirestore(e)) throw new Error(mensajePermisosTerminalComedor())
    throw e
  }
}

export type CrearRegistroComedorInput = {
  persona: PadronPersona
  servicio?: ServicioComedor
  usuarioRegistro: string
}

function buildPayloadRegistroComedor({
  persona,
  servicio,
  usuarioRegistro,
}: CrearRegistroComedorInput): Record<string, unknown> {
  if (!servicio) {
    throw new Error('Servicio de comedor no definido.')
  }
  const diaOperativo = diaOperativoYmdLocal()
  const contieneRefrigerio = contieneRefrigerioPorServicio(servicio)
  const payload: Record<string, unknown> = {
    dni: persona.dni.trim().toUpperCase(),
    nombre: persona.nombre.trim(),
    apellido: persona.apellido.trim(),
    empresa: persona.empresa.trim(),
    servicio,
    diaOperativo,
    fechaHora: serverTimestamp(),
    usuarioRegistro: usuarioRegistro.trim(),
  }
  if (contieneRefrigerio) {
    payload.contieneRefrigerio = true
  }
  return payload
}

/** Crea un documento en `registros_comedor` (espera confirmación de Firestore). */
export async function crearRegistroComedor(input: CrearRegistroComedorInput): Promise<string> {
  const db = getDb()
  const ref = doc(collection(db, COL_REGISTROS_COMEDOR))
  const payload = buildPayloadRegistroComedor(input)
  try {
    await setDoc(ref, payload)
    return ref.id
  } catch (e) {
    if (esPermissionDeniedFirestore(e)) throw new Error(mensajePermisosTerminalComedor())
    throw e
  }
}

/**
 * Encola el registro sin bloquear la UI (offline-first / fire-and-forget).
 * Devuelve el id del documento de inmediato; `promise` resuelve al persistir en cola local/servidor.
 */
export function encolarRegistroComedor(input: CrearRegistroComedorInput): {
  id: string
  promise: Promise<void>
} {
  const db = getDb()
  const ref = doc(collection(db, COL_REGISTROS_COMEDOR))
  const payload = buildPayloadRegistroComedor(input)
  const promise = setDoc(ref, payload).then(() => undefined).catch((e) => {
    if (esPermissionDeniedFirestore(e)) throw new Error(mensajePermisosTerminalComedor())
    throw e
  })
  return { id: ref.id, promise }
}

function ordenarRegistrosRecientes(rows: RegistroComedor[]): RegistroComedor[] {
  return [...rows].sort((a, b) => {
    const ta = a.fechaHora?.getTime() ?? 0
    const tb = b.fechaHora?.getTime() ?? 0
    if (tb !== ta) return tb - ta
    return b.id.localeCompare(a.id)
  })
}

/**
 * Registros del día operativo actual hechos desde este terminal (`usuarioRegistro` = uid).
 * Misma base que el contador, filtrado por dispositivo/sesión.
 */
export function subscribeRegistrosComedorHoyEnDispositivo(
  usuarioRegistro: string,
  onChange: (rows: RegistroComedor[]) => void,
): Unsubscribe {
  const uid = usuarioRegistro.trim()
  if (!uid) {
    onChange([])
    return () => {}
  }
  const db = getDb()
  const hoyString = diaOperativoYmdLocal()
  const q = query(
    collection(db, COL_REGISTROS_COMEDOR),
    where('diaOperativo', '==', hoyString),
    where('usuarioRegistro', '==', uid),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: RegistroComedor[] = []
      snap.forEach((d) =>
        rows.push(mapRegistroComedor(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(ordenarRegistrosRecientes(rows))
    },
    (err: FirestoreErrorish) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] registros_comedor:', mensajePermisosTerminalComedor())
      } else {
        console.error('[Firestore] registros_comedor (historial terminal)', err)
      }
      onChange([])
    },
  )
}

/**
 * Contador en tiempo real del día local. Usa `diaOperativo` (string YYYY-MM-DD) para que
 * el snapshot incluya escrituras offline antes de resolver `serverTimestamp()`.
 */
export function subscribeContadorComedorHoy(onChange: (total: number) => void): Unsubscribe {
  const db = getDb()
  const hoyString = diaOperativoYmdLocal()
  const q = query(
    collection(db, COL_REGISTROS_COMEDOR),
    where('diaOperativo', '==', hoyString),
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.size),
    (err: FirestoreErrorish) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] registros_comedor:', mensajePermisosTerminalComedor())
      } else {
        console.error('[Firestore] registros_comedor', err)
      }
      onChange(0)
    },
  )
}

/**
 * Suscripción por rango de `diaOperativo` (YYYY-MM-DD, día operativo local).
 * Sin `limit()`: el volumen queda acotado por el rango Desde/Hasta del reporte.
 * Filtros de empresa/servicio se aplican en cliente.
 */
export function subscribeRegistrosComedorPorRango(
  desde: string,
  hasta: string,
  onChange: (rows: RegistroComedor[]) => void,
): Unsubscribe {
  if (!desde || !hasta || desde > hasta) {
    onChange([])
    return () => {}
  }
  const db = getDb()
  const q = query(
    collection(db, COL_REGISTROS_COMEDOR),
    where('diaOperativo', '>=', desde),
    where('diaOperativo', '<=', hasta),
    orderBy('diaOperativo', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: RegistroComedor[] = []
      snap.forEach((d) =>
        rows.push(mapRegistroComedor(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(rows)
    },
    (err: FirestoreErrorish) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] registros_comedor:', mensajePermisosRegistrosComedor())
      } else {
        console.error('[Firestore] registros_comedor (reporte)', err)
      }
      onChange([])
    },
  )
}

/** Servicios principales para KPI "servicio pico" (excluye fuera de horario). */
export const SERVICIOS_COMEDOR_PRINCIPALES: ServicioComedor[] = [
  'DESAYUNO',
  'ALMUERZO',
  'MERIENDA',
  'CENA',
]
