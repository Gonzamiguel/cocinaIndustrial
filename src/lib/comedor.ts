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
import { USUARIO_REGISTRO_SUPERVISOR_MANUAL, type RegistroComedor, type ServicioComedor } from '../types/comedor'
import { contieneRefrigerioPorServicio, etiquetaServicioComedor } from './servicioComedor'

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
    'Roles con acceso en `/control`: `admin_campamento`, `hoteleria_casposo`, `gerencia`, `analista` (escritura); ' +
    'en terminal: `terminal_comedor`, `jefe_campamento`.'
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
    observaciones:
      typeof data.observaciones === 'string' && data.observaciones.trim()
        ? data.observaciones.trim()
        : undefined,
    liquidado: data.liquidado === true ? true : undefined,
    liquidacionId:
      typeof data.liquidacionId === 'string' && data.liquidacionId.trim()
        ? data.liquidacionId.trim()
        : undefined,
  }
}

/** Fecha local YYYY-MM-DD (no usar `toISOString`: es UTC y puede cambiar el día). */
export function diaOperativoYmdLocal(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function claveRegistroComedorDia(
  dni: string,
  servicio: ServicioComedor,
  diaOperativo: string,
): string {
  return `${dni.trim().toUpperCase()}|${servicio}|${diaOperativo.trim()}`
}

export function mensajeRegistroDuplicadoComedor(
  servicio: ServicioComedor,
  diaOperativo: string,
): string {
  return `Esta persona (DNI) ya fue registrada en ${etiquetaServicioComedor(servicio)} el día ${diaOperativo}. Solo se permite un registro por servicio por día.`
}

/** Comprueba duplicado en un arreglo ya cargado (mismo día operativo + servicio + DNI). */
export function yaRegistradoComedorEnLista(
  dni: string,
  servicio: ServicioComedor,
  diaOperativo: string,
  registros: RegistroComedor[],
): boolean {
  const clave = claveRegistroComedorDia(dni, servicio, diaOperativo)
  return registros.some(
    (r) => claveRegistroComedorDia(r.dni, r.servicio, r.diaOperativo) === clave,
  )
}

/**
 * Consulta Firestore: ¿ya existe registro para este DNI, servicio y día operativo?
 * Requiere índice compuesto en `registros_comedor` (diaOperativo, dni, servicio).
 */
export async function existeRegistroComedorDiaServicio(input: {
  dni: string
  servicio: ServicioComedor
  diaOperativo?: string
}): Promise<boolean> {
  const d = input.dni.trim().toUpperCase()
  if (!d || input.servicio === 'FUERA DE HORARIO') return false
  const ymd = (input.diaOperativo?.trim() || diaOperativoYmdLocal()).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false

  const db = getDb()
  try {
    const q = query(
      collection(db, COL_REGISTROS_COMEDOR),
      where('diaOperativo', '==', ymd),
      where('dni', '==', d),
      where('servicio', '==', input.servicio),
      limit(1),
    )
    const snap = await getDocs(q)
    return !snap.empty
  } catch (e) {
    if (esPermissionDeniedFirestore(e)) {
      throw new Error(mensajePermisosTerminalComedor())
    }
    throw e
  }
}

/**
 * Lanza si la persona ya tiene registro para ese servicio en el día (local + servidor).
 */
export async function validarRegistroComedorUnico(input: {
  persona: PadronPersona
  servicio: ServicioComedor
  diaOperativo?: string
  registrosLocales?: RegistroComedor[]
  /** Sin red: validar solo contra `registrosLocales` y cola optimista. */
  omitirConsultaServidor?: boolean
}): Promise<void> {
  const ymd = (input.diaOperativo?.trim() || diaOperativoYmdLocal()).trim()
  const dni = input.persona.dni.trim().toUpperCase()

  if (
    input.registrosLocales?.length &&
    yaRegistradoComedorEnLista(dni, input.servicio, ymd, input.registrosLocales)
  ) {
    throw new Error(mensajeRegistroDuplicadoComedor(input.servicio, ymd))
  }

  if (
    !input.omitirConsultaServidor &&
    (await existeRegistroComedorDiaServicio({ dni, servicio: input.servicio, diaOperativo: ymd }))
  ) {
    throw new Error(mensajeRegistroDuplicadoComedor(input.servicio, ymd))
  }
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
  /** Día operativo YYYY-MM-DD; por defecto hoy local. */
  diaOperativo?: string
  observaciones?: string
  /** Evita round-trip si ya tenés registros del rango en memoria. */
  registrosLocales?: RegistroComedor[]
}

function buildPayloadRegistroComedor({
  persona,
  servicio,
  usuarioRegistro,
  diaOperativo: diaOperativoInput,
  observaciones,
}: CrearRegistroComedorInput): Record<string, unknown> {
  if (!servicio) {
    throw new Error('Servicio de comedor no definido.')
  }
  const ymd = (diaOperativoInput?.trim() || diaOperativoYmdLocal()).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error('Día operativo inválido (usá YYYY-MM-DD).')
  }
  const contieneRefrigerio = contieneRefrigerioPorServicio(servicio)
  const payload: Record<string, unknown> = {
    dni: persona.dni.trim().toUpperCase(),
    nombre: persona.nombre.trim(),
    apellido: persona.apellido.trim(),
    empresa: persona.empresa.trim(),
    servicio,
    diaOperativo: ymd,
    fechaHora: serverTimestamp(),
    usuarioRegistro: usuarioRegistro.trim(),
  }
  if (contieneRefrigerio) {
    payload.contieneRefrigerio = true
  }
  const obs = observaciones?.trim()
  if (obs) {
    payload.observaciones = obs
  }
  return payload
}

/** Crea un documento en `registros_comedor` (espera confirmación de Firestore). */
export async function crearRegistroComedor(input: CrearRegistroComedorInput): Promise<string> {
  if (!input.servicio) {
    throw new Error('Servicio de comedor no definido.')
  }
  await validarRegistroComedorUnico({
    persona: input.persona,
    servicio: input.servicio,
    diaOperativo: input.diaOperativo,
    registrosLocales: input.registrosLocales,
  })

  const db = getDb()
  const ref = doc(collection(db, COL_REGISTROS_COMEDOR))
  const payload = buildPayloadRegistroComedor(input)
  try {
    await setDoc(ref, payload)
    return ref.id
  } catch (e) {
    if (esPermissionDeniedFirestore(e)) {
      throw new Error(
        input.usuarioRegistro.trim() === USUARIO_REGISTRO_SUPERVISOR_MANUAL
          ? mensajePermisosRegistrosComedor()
          : mensajePermisosTerminalComedor(),
      )
    }
    throw e
  }
}

/** Alta manual desde dashboard de campamento (día operativo histórico + motivo). */
export async function crearRegistroComedorRetroactivoSupervisor(input: {
  persona: PadronPersona
  servicio: ServicioComedor
  diaOperativo: string
  observaciones: string
  registrosLocales?: RegistroComedor[]
}): Promise<string> {
  const obs = input.observaciones.trim()
  if (!obs) throw new Error('Completá observaciones / motivo.')
  if (input.servicio === 'FUERA DE HORARIO') {
    throw new Error('Elegí un servicio de la lista (no fuera de horario).')
  }
  return crearRegistroComedor({
    persona: input.persona,
    servicio: input.servicio,
    usuarioRegistro: USUARIO_REGISTRO_SUPERVISOR_MANUAL,
    diaOperativo: input.diaOperativo.trim(),
    observaciones: obs,
    registrosLocales: input.registrosLocales,
  })
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
